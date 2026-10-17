const Booking = require("../models/Booking");
const { VN_TZ, isValidYm, monthRangeVN } = require("../lib/timezone");

// Hiện tại 2 hàm bên dưới không nhận input từ client (không có tham số cần validate).
class StatsError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Điều kiện lọc theo tháng cho 2 nguồn doanh thu: phần vé (payment.paid_at) và phần phạt hủy. */
function monthFilters(month) {
  if (month === undefined || month === null || month === "") return { paid: {}, refunded: {} };
  if (!isValidYm(month)) throw new StatsError("month phải có dạng YYYY-MM (VD 2026-10).", 400);
  const { start, end } = monthRangeVN(month);
  return {
    paid: { "payment.paid_at": { $gte: start, $lt: end } },
    refunded: { refund_processed_at: { $gte: start, $lt: end } },
  };
}

/** Doanh thu theo tháng — gộp 2 nguồn: flights[].amount (confirmed, theo paid_at) và cancellation_fee_amount. */
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

  // Gộp 2 nguồn theo key tháng — không dùng chung 1 pipeline vì 2 nguồn group theo 2 field ngày khác nhau.
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

/** Doanh thu theo tuyến bay (origin_code -> dest_code) — gộp flights[].amount. */
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
    // Bắt buộc tính original_total trước $unwind — sau $unwind.
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

/** Các con số tổng quan cho trang Tổng quan admin (doanh thu tổng lấy từ getRevenueByMonth). */
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