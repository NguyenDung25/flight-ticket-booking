// services/statsService.js
//
// A6 — Thống kê doanh thu theo tháng & theo tuyến bay, dùng MongoDB
// Aggregation Pipeline (mục 10, không dùng Transaction).
// API liên quan: GET /api/admin/stats/revenue
//
// Công thức doanh thu (đã sửa — có cộng tiền phạt hủy vé, xem
// chuc-nang-he-thong.md mục A6):
//   doanh thu = Σ(flights[].amount của Booking status=confirmed)
//             + Σ(cancellation_fee_amount của Booking status=refunded)
// Khoản phạt hủy vé là tiền hãng thực thu (không hoàn khách) nên vẫn tính
// doanh thu — chỉ riêng `refund_amount` (phần hoàn lại) bị loại.
//
// "Theo tháng": phần confirmed dùng payment.paid_at, phần phạt dùng
// refund_processed_at — KHÔNG dùng created_at của booking.
//
// "Theo tháng" áp dụng NHƯ NHAU cho mọi con số: truyền `month` ("YYYY-MM", giờ VN) vào getRevenueByRoute /
// getSummaryCounts thì chỉ tính các đơn có paid_at (phần vé) hoặc refund_processed_at (phần phạt hủy) nằm
// trong tháng đó — nên tổng doanh thu các tuyến của 1 tháng KHỚP với doanh thu tháng đó ở getRevenueByMonth.
// Không truyền `month` = toàn thời gian (hành vi cũ, API /api/admin/stats/revenue không kèm ?month=).
//
// "Theo tuyến": flights[].amount phân bổ tự nhiên theo từng chặng;
// cancellation_fee_amount nằm ở CẤP BOOKING (không theo chặng) nên phải
// PHÂN BỔ THEO TỶ LỆ flights[].amount gốc của từng chặng trong booking đó —
// bẫy kỹ thuật: nếu $unwind flights rồi cộng thẳng cancellation_fee_amount,
// MongoDB nhân bản trường đơn này ra MỌI phần tử flights[], khiến vé khứ hồi
// (2 chặng) bị tính phạt gấp đôi giá trị thật. Phải $addFields tính
// original_total (= $sum flights.amount) TRƯỚC $unwind, rồi $project chia
// tỷ lệ ngay trong pipeline.

const Booking = require("../models/Booking");
const { VN_TZ, isValidYm, monthRangeVN } = require("../lib/timezone");

// Hiện tại 2 hàm bên dưới không nhận input từ client (không có tham số cần
// validate), nên chưa có nhánh nào thật sự throw StatsError. Vẫn khai báo
// class này theo ĐÚNG convention chung của các service khác (mỗi service có
// 1 Error class riêng, statusCode rõ ràng) để nơi gọi (API route) luôn có thể
// phân biệt lỗi nghiệp vụ (4xx) với lỗi hệ thống/DB (500) theo cùng 1 kiểu xử
// lý thống nhất trong toàn bộ backend — và sẵn sàng dùng ngay khi A6 mở rộng
// thêm tham số lọc ở phase sau.
class StatsError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Điều kiện lọc theo tháng cho 2 nguồn doanh thu: phần vé (payment.paid_at) và phần phạt hủy
 * (refund_processed_at). month = undefined -> không lọc (toàn thời gian).
 * @returns {{paid: object, refunded: object}} các mảnh điều kiện gộp thêm vào $match
 */
function monthFilters(month) {
  if (month === undefined || month === null || month === "") return { paid: {}, refunded: {} };
  if (!isValidYm(month)) throw new StatsError("month phải có dạng YYYY-MM (VD 2026-10).", 400);
  const { start, end } = monthRangeVN(month);
  return {
    paid: { "payment.paid_at": { $gte: start, $lt: end } },
    refunded: { refund_processed_at: { $gte: start, $lt: end } },
  };
}

/**
 * Doanh thu theo tháng — gộp 2 nguồn: flights[].amount (confirmed, theo
 * paid_at) và cancellation_fee_amount (refunded, theo refund_processed_at).
 *
 * @returns {Promise<Array<{month: string, confirmed_revenue: number, penalty_revenue: number, total_revenue: number}>>}
 */
async function getRevenueByMonth() {
  const confirmedByMonth = await Booking.aggregate([
    { $match: { status: "confirmed", "payment.paid_at": { $ne: null } } },
    { $unwind: "$flights" },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$payment.paid_at", timezone: VN_TZ } },
        confirmed_revenue: { $sum: "$flights.amount" },
      },
    },
  ]);

  const penaltyByMonth = await Booking.aggregate([
    {
      $match: {
        status: "refunded",
        cancellation_fee_amount: { $gt: 0 },
        refund_processed_at: { $ne: null },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m", date: "$refund_processed_at", timezone: VN_TZ },
        },
        penalty_revenue: { $sum: "$cancellation_fee_amount" },
      },
    },
  ]);

  // Gộp 2 nguồn theo key tháng — không dùng chung 1 pipeline vì 2 nguồn
  // group theo 2 field ngày khác nhau (paid_at vs refund_processed_at).
  const merged = new Map();
  for (const row of confirmedByMonth) {
    merged.set(row._id, { month: row._id, confirmed_revenue: row.confirmed_revenue, penalty_revenue: 0 });
  }
  for (const row of penaltyByMonth) {
    const existing = merged.get(row._id) || { month: row._id, confirmed_revenue: 0, penalty_revenue: 0 };
    existing.penalty_revenue = row.penalty_revenue;
    merged.set(row._id, existing);
  }

  return [...merged.values()]
    .map((r) => ({ ...r, total_revenue: r.confirmed_revenue + r.penalty_revenue }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Doanh thu theo tuyến bay (origin_code -> dest_code) — gộp flights[].amount
 * (confirmed) + cancellation_fee_amount phân bổ theo tỷ lệ (refunded).
 *
 * @param {string} [month] "YYYY-MM" (giờ VN): chỉ tính doanh thu phát sinh trong tháng đó; bỏ trống = toàn thời gian.
 * @returns {Promise<Array<{origin: string, dest: string, confirmed_revenue: number, penalty_revenue: number, total_revenue: number}>>}
 */
async function getRevenueByRoute(month) {
  const filters = monthFilters(month);
  const confirmedByRoute = await Booking.aggregate([
    { $match: { status: "confirmed", ...filters.paid } },
    { $unwind: "$flights" },
    {
      $lookup: {
        from: "flights",
        localField: "flights.flight_id",
        foreignField: "_id",
        as: "flight_doc",
      },
    },
    { $unwind: "$flight_doc" },
    {
      $group: {
        _id: { origin: "$flight_doc.origin_code", dest: "$flight_doc.dest_code" },
        confirmed_revenue: { $sum: "$flights.amount" },
      },
    },
  ]);

  const penaltyByRoute = await Booking.aggregate([
    { $match: { status: "refunded", cancellation_fee_amount: { $gt: 0 }, ...filters.refunded } },
    // BẮT BUỘC tính original_total TRƯỚC $unwind — sau $unwind, "$flights.amount"
    // chỉ còn là 1 số của riêng 1 chặng, không phải mảng để $sum nữa.
    { $addFields: { original_total: { $sum: "$flights.amount" } } },
    { $unwind: "$flights" },
    {
      $project: {
        flight_id: "$flights.flight_id",
        // Phân bổ tỷ lệ — tránh nhân đôi tiền phạt cho vé khứ hồi (2 chặng).
        fee_share: {
          $cond: [
            { $eq: ["$original_total", 0] },
            0,
            {
              $multiply: [
                "$cancellation_fee_amount",
                { $divide: ["$flights.amount", "$original_total"] },
              ],
            },
          ],
        },
      },
    },
    {
      $lookup: {
        from: "flights",
        localField: "flight_id",
        foreignField: "_id",
        as: "flight_doc",
      },
    },
    { $unwind: "$flight_doc" },
    {
      $group: {
        _id: { origin: "$flight_doc.origin_code", dest: "$flight_doc.dest_code" },
        penalty_revenue: { $sum: "$fee_share" },
      },
    },
  ]);

  const keyOf = (o, d) => `${o}-${d}`;
  const merged = new Map();
  for (const row of confirmedByRoute) {
    const key = keyOf(row._id.origin, row._id.dest);
    merged.set(key, {
      origin: row._id.origin,
      dest: row._id.dest,
      confirmed_revenue: row.confirmed_revenue,
      penalty_revenue: 0,
    });
  }
  for (const row of penaltyByRoute) {
    const key = keyOf(row._id.origin, row._id.dest);
    const existing =
      merged.get(key) || {
        origin: row._id.origin,
        dest: row._id.dest,
        confirmed_revenue: 0,
        penalty_revenue: 0,
      };
    existing.penalty_revenue = row.penalty_revenue;
    merged.set(key, existing);
  }

  return [...merged.values()]
    .map((r) => ({ ...r, total_revenue: r.confirmed_revenue + r.penalty_revenue }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
}

/**
 * Các con số tổng quan cho trang Tổng quan admin (doanh thu tổng lấy từ getRevenueByMonth). Truyền `month`
 * ("YYYY-MM", giờ VN) để chỉ đếm trong tháng đó — cùng quy tắc gán tháng như doanh thu:
 *  - tickets_sold: số GHẾ (passengers[].seats[]) thuộc các booking đang `confirmed` THANH TOÁN trong tháng
 *    (payment.paid_at) — mỗi ghế trên mỗi chặng là 1 vé (khứ hồi 2 chặng x 1 khách = 2 vé). Booking đã
 *    hủy/hoàn không còn tính.
 *  - cancelled_bookings: số booking `refunded` được hoàn tiền trong tháng (refund_processed_at) = khách ĐÃ
 *    THANH TOÁN rồi mới hủy. KHÔNG tính booking `cancelled` (chưa từng thanh toán: khách bỏ dở/quá hạn, cron
 *    tự hủy) vì không phải vé đã bán bị hủy — đếm vào sẽ làm tỷ lệ hủy phồng lên.
 *  - manual_refund_pending: số booking `payment_error_manual_refund` đang chờ admin hoàn tiền tay (A7) —
 *    việc tồn đọng HIỆN TẠI nên KHÔNG lọc theo tháng.
 *
 * @param {string} [month] "YYYY-MM"; bỏ trống = toàn thời gian
 * @returns {Promise<{tickets_sold: number, cancelled_bookings: number, manual_refund_pending: number}>}
 */
async function getSummaryCounts(month) {
  const filters = monthFilters(month);
  const [ticketRows, cancelledBookings, manualRefundPending] = await Promise.all([
    Booking.aggregate([
      { $match: { status: "confirmed", ...filters.paid } },
      { $unwind: "$passengers" },
      { $unwind: "$passengers.seats" },
      { $count: "tickets" },
    ]),
    Booking.countDocuments({ status: "refunded", ...filters.refunded }),
    Booking.countDocuments({ status: "payment_error_manual_refund" }),
  ]);
  return {
    tickets_sold: ticketRows[0]?.tickets ?? 0,
    cancelled_bookings: cancelledBookings,
    manual_refund_pending: manualRefundPending,
  };
}

module.exports = { StatsError, monthFilters, getRevenueByMonth, getRevenueByRoute, getSummaryCounts };