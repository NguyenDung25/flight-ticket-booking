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
// "Theo tuyến": flights[].amount phân bổ tự nhiên theo từng chặng;
// cancellation_fee_amount nằm ở CẤP BOOKING (không theo chặng) nên phải
// PHÂN BỔ THEO TỶ LỆ flights[].amount gốc của từng chặng trong booking đó —
// bẫy kỹ thuật: nếu $unwind flights rồi cộng thẳng cancellation_fee_amount,
// MongoDB nhân bản trường đơn này ra MỌI phần tử flights[], khiến vé khứ hồi
// (2 chặng) bị tính phạt gấp đôi giá trị thật. Phải $addFields tính
// original_total (= $sum flights.amount) TRƯỚC $unwind, rồi $project chia
// tỷ lệ ngay trong pipeline.

const Booking = require("../models/Booking");
const { VN_TZ } = require("../lib/timezone");

// Hiện tại 2 hàm bên dưới không nhận input từ client (không có tham số cần
// validate), nên chưa có nhánh nào thật sự throw StatsError. Vẫn khai báo
// class này theo ĐÚNG convention chung của các service khác (mỗi service có
// 1 Error class riêng, statusCode rõ ràng) để nơi gọi (API route) luôn có thể
// phân biệt lỗi nghiệp vụ (4xx) với lỗi hệ thống/DB (500) theo cùng 1 kiểu xử
// lý thống nhất trong toàn bộ backend — và sẵn sàng dùng ngay khi A6 mở rộng
// thêm tham số lọc (VD from/to theo tháng) ở phase sau.
class StatsError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
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
 * @returns {Promise<Array<{origin: string, dest: string, confirmed_revenue: number, penalty_revenue: number, total_revenue: number}>>}
 */
async function getRevenueByRoute() {
  const confirmedByRoute = await Booking.aggregate([
    { $match: { status: "confirmed" } },
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
    { $match: { status: "refunded", cancellation_fee_amount: { $gt: 0 } } },
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

module.exports = { StatsError, getRevenueByMonth, getRevenueByRoute };