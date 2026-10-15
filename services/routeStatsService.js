// services/routeStatsService.js
//
// Số liệu thật cho khối "Tuyến bay phổ biến" ở trang chủ: với mỗi tuyến (điểm đi → điểm đến) lấy GIÁ
// hạng phổ thông thấp nhất, giờ khởi hành gần nhất và số chuyến — chỉ tính chuyến `scheduled` CHƯA khởi
// hành (đúng điều kiện tìm kiếm chuyến bay chấp nhận). Một truy vấn $group cho cả danh sách tuyến.

const Flight = require("../models/Flight");
const { routeKey } = require("../lib/popularRoutes");

/** Bộ lọc chuyến tính vào thống kê: đúng các tuyến, chưa bị hủy, CHƯA khởi hành. */
function buildRouteMatch(routes, now) {
  return {
    status: "scheduled",
    departure_time: { $gt: now },
    $or: routes.map(([origin, dest]) => ({ origin_code: origin, dest_code: dest })),
  };
}

/**
 * @param {Array<[string,string]>} routes
 * @param {Date} [now]
 * @returns {Promise<Map<string,{minPrice:number,nextDeparture:Date,flights:number}>>}
 */
async function getRouteStats(routes, now = new Date()) {
  if (!routes.length) return new Map();
  const rows = await Flight.aggregate([
    { $match: buildRouteMatch(routes, now) },
    {
      $group: {
        _id: { origin: "$origin_code", dest: "$dest_code" },
        minPrice: { $min: "$base_price.economy" },
        nextDeparture: { $min: "$departure_time" },
        flights: { $sum: 1 },
      },
    },
  ]);
  return new Map(
    rows.map((r) => [
      routeKey(r._id.origin, r._id.dest),
      { minPrice: r.minPrice, nextDeparture: r.nextDeparture, flights: r.flights },
    ])
  );
}

module.exports = { getRouteStats, buildRouteMatch };
