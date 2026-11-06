const { dayRangeVN } = require("./timezone");

const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);

/**
 * Bộ lọc danh sách chuyến bay ở trang quản trị. Số hiệu bắt đầu bằng `q`, hoặc đúng ngày bay (giờ VN).
 * Không lọc thì lấy các chuyến từ 24 giờ trước trở đi (trang sắp theo ngày bay tăng dần) — dữ liệu nhiều ngày nên sắp giảm dần
 * sẽ che mất các chuyến vừa tạo ở ngày gần.
 */
function buildAdminFlightFilter({ airlineId, q, date, now = Date.now() }) {
  const qText = typeof q === "string" ? q.trim().slice(0, 12) : "";
  const dateText = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  const filter = { airline_id: airlineId ?? null };
  if (qText) filter.flight_number = { $regex: "^" + escapeRegex(qText), $options: "i" };
  if (dateText) {
    const { start, end } = dayRangeVN(dateText);
    filter.departure_time = { $gte: start, $lte: end };
  } else {
    filter.departure_time = { $gte: new Date(now - 24 * 3600 * 1000) };
  }
  return { filter, qText, dateText, filtered: !!(qText || dateText) };
}

module.exports = { buildAdminFlightFilter };
