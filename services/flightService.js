const Flight = require("../models/Flight");
const Booking = require("../models/Booking");
// Flight.airline_id/aircraft_id chỉ là { ref: "Airline"/"Aircraft" } (tên chuỗi).
require("../models/Airline");
require("../models/Aircraft");
const { dayRangeVN, todayStringVN, isValidYmd } = require("../lib/timezone");
const { MAX_PASSENGERS_PER_BOOKING } = require("../config/constants");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class FlightError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Đếm số ghế còn `available` theo từng seat_class, ngay trong Aggregation Pipeline. */
// Ghế trống = `available`, hoặc `held` đã quá hạn (cron chưa kịp nhả) — khớp seatService.holdSeat.
const AVAILABLE_SEAT_COND = {
  $or: [
    { $eq: ["$$s.status", "available"] },
    { $and: [{ $eq: ["$$s.status", "held"] }, { $lt: ["$$s.held_until", "$$NOW"] }] },
  ],
};

function buildAvailableSeatsProjection() {
  return {
    economy: {
      $size: {
        $filter: {
          input: "$seats",
          as: "s",
          cond: { $and: [AVAILABLE_SEAT_COND, { $eq: ["$$s.seat_class", "economy"] }] },
        },
      },
    },
    business: {
      $size: {
        $filter: {
          input: "$seats",
          as: "s",
          cond: { $and: [AVAILABLE_SEAT_COND, { $eq: ["$$s.seat_class", "business"] }] },
        },
      },
    },
  };
}

/** Query 1 chặng bay theo route + 1 ngày dương lịch (giờ VN). */
async function queryFlightsByLeg({ origin, destination, date }) {
  const { start: dayStart, end } = dayRangeVN(date);
  const now = new Date();
  const start = dayStart > now ? dayStart : now;

  return Flight.aggregate([
    {
      $match: {
        origin_code: origin.toUpperCase(),
        dest_code: destination.toUpperCase(),
        departure_time: { $gte: start, $lt: end },
        status: "scheduled",
      },
    },
    {
      $lookup: {
        from: "airlines",
        localField: "airline_id",
        foreignField: "_id",
        as: "airline",
      },
    },
    { $unwind: "$airline" },
    {
      $project: {
        flight_number: 1,
        origin_code: 1,
        dest_code: 1,
        departure_time: 1,
        arrival_time: 1,
        base_price: 1,
        airline: { _id: "$airline._id", code: "$airline.code", name: "$airline.name" },
        available_seats: buildAvailableSeatsProjection(),
      },
    },
    { $sort: { departure_time: 1 } },
  ]);
}

/** C1 — tìm kiếm chuyến bay. */
async function searchFlights({ origin, destination, departureDate, tripType, returnDate, passengerCount }) {
  if (!origin || !destination) {
    throw new FlightError("Thiếu điểm đi hoặc điểm đến.");
  }
  if (origin === destination) {
    throw new FlightError("Điểm đi và điểm đến không được trùng nhau.");
  }
  if (!departureDate) {
    throw new FlightError("Thiếu ngày bay.");
  }
  // Ngày phải đúng định dạng YYYY-MM-DD và là ngày có thật (chặn "abc", "2026-02-31").
  if (!isValidYmd(departureDate)) {
    throw new FlightError("Ngày bay không hợp lệ (định dạng YYYY-MM-DD).");
  }
  // So sánh chuỗi YYYY-MM-DD là đúng thứ tự thời gian (cùng độ dài, cùng định dạng).
  if (departureDate < todayStringVN()) {
    throw new FlightError("Ngày bay không được ở trong quá khứ.");
  }
  if (!["one_way", "round_trip"].includes(tripType)) {
    throw new FlightError("trip_type phải là 'one_way' hoặc 'round_trip'.");
  }
  if (tripType === "round_trip" && !returnDate) {
    throw new FlightError("Vé khứ hồi bắt buộc phải có return_date.");
  }
  if (tripType === "round_trip") {
    if (!isValidYmd(returnDate)) {
      throw new FlightError("Ngày về không hợp lệ (định dạng YYYY-MM-DD).");
    }
    if (returnDate < departureDate) {
      throw new FlightError("Ngày về không được trước ngày đi.");
    }
  }
  if (
    passengerCount !== undefined &&
    (!Number.isInteger(passengerCount) ||
      passengerCount < 1 ||
      passengerCount > MAX_PASSENGERS_PER_BOOKING)
  ) {
    throw new FlightError(
      `passenger_count phải là số nguyên từ 1 đến ${MAX_PASSENGERS_PER_BOOKING}.`
    );
  }

  const outbound = await queryFlightsByLeg({ origin, destination, date: departureDate });

  if (tripType === "one_way") {
    return { outbound, return: null };
  }

  const returnLeg = await queryFlightsByLeg({ origin: destination, destination: origin, date: returnDate });
  return { outbound, return: returnLeg };
}

/** C3 — chi tiết 1 chuyến bay. */
async function getFlightDetail(flightId) {
  const flight = await Flight.findById(flightId)
    .populate("airline_id", "code name")
    .populate("aircraft_id", "name");
  // Cố ý trả đủ field (kể cả seats[].held_by).

  if (!flight) {
    throw new FlightError("Không tìm thấy chuyến bay.", 404);
  }

  return flight;
}

/** A1 (ghi chú v) — chặn sửa `departure_time`/`aircraft_id` hoặc xóa chuyến bay nếu đang có booking hiệu lực… */
async function assertNoActiveBooking(flightId) {
  const hasActive = await Booking.exists({
    "flights.flight_id": flightId,
    status: { $in: ["pending_payment", "confirmed"] },
  });
  if (hasActive) {
    throw new FlightError(
      "Chuyến bay đang có booking hiệu lực (chưa hủy) — không thể sửa giờ bay hoặc xóa. Dùng chức năng hủy chuyến (A8) nếu cần ngừng khai thác.",
      409
    );
  }
}

/** Giá phổ thông thấp nhất theo từng ngày (giờ VN) của 1 tuyến — cho dải chọn ngày ở trang kết quả tìm kiếm. */
async function getDailyMinPrices({ origin, destination, dates }) {
  if (!origin || !destination || !Array.isArray(dates) || dates.length === 0) return {};
  const sorted = [...dates].sort();
  const now = new Date();
  const first = dayRangeVN(sorted[0]).start;
  const end = dayRangeVN(sorted[sorted.length - 1]).end;
  if (end <= now) return {};
  const rows = await Flight.aggregate([
    {
      $match: {
        origin_code: String(origin).toUpperCase(),
        dest_code: String(destination).toUpperCase(),
        departure_time: { $gte: first > now ? first : now, $lt: end },
        status: "scheduled",
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$departure_time", timezone: "Asia/Ho_Chi_Minh" } },
        min: { $min: "$base_price.economy" },
      },
    },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.min]));
}

module.exports = {
  FlightError,
  searchFlights,
  getDailyMinPrices,
  getFlightDetail,
  assertNoActiveBooking,
};