const Flight = require("../models/Flight");
const { routeKey } = require("../lib/popularRoutes");

/** Bộ lọc chuyến tính vào thống kê: đúng các tuyến, chưa bị hủy, chưa khởi hành. */
function buildRouteMatch(routes, now) {
  return {
    status: "scheduled",
    departure_time: { $gt: now },
    $or: routes.map(([origin, dest]) => ({ origin_code: origin, dest_code: dest })),
  };
}

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
