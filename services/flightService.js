// services/flightService.js
//
// C1 (tìm kiếm chuyến bay), C3 (chi tiết 1 chuyến bay). C2 (lọc theo giá/
// khung giờ/hãng bay) xử lý phía client trên kết quả C1 đã trả về (theo đúng
// ghi chú kỹ thuật C2 — quy mô đồ án không cần query lại server).
//
// API liên quan: GET /api/flights/search (C1), GET /api/flights/[id] (C3)

const Flight = require("../models/Flight");
const { dayRangeVN } = require("../lib/timezone");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class FlightError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Đếm số ghế còn `available` theo từng seat_class, ngay trong Aggregation
 * Pipeline — TRÁNH trả nguyên mảng `seats[]` (có thể vài trăm phần tử/chuyến)
 * về client chỉ để hiển thị danh sách kết quả tìm kiếm (C1/C2), vốn chỉ cần
 * biết còn trống bao nhiêu ghế mỗi hạng, không cần seat_number cụ thể.
 * Seat map chi tiết (để chọn ghế) chỉ cần tải riêng ở bước C5.
 */
function buildAvailableSeatsProjection() {
  return {
    economy: {
      $size: {
        $filter: {
          input: "$seats",
          as: "s",
          cond: { $and: [{ $eq: ["$$s.status", "available"] }, { $eq: ["$$s.seat_class", "economy"] }] },
        },
      },
    },
    business: {
      $size: {
        $filter: {
          input: "$seats",
          as: "s",
          cond: { $and: [{ $eq: ["$$s.status", "available"] }, { $eq: ["$$s.seat_class", "business"] }] },
        },
      },
    },
  };
}

/**
 * Query 1 chặng bay theo route + 1 ngày dương lịch (giờ VN). Dùng chung cho
 * cả chặng đi và chặng về (round_trip chỉ đảo `origin`/`destination`).
 *
 * CHỈ trả chuyến `status: "scheduled"` — chuyến đã bị hãng hủy (`cancelled`)
 * không được hiển thị cho khách tìm/đặt tiếp, dù dữ liệu vẫn còn trong DB
 * (A8 xử lý booking liên quan, không xóa Flight).
 *
 * Sắp xếp mặc định theo `departure_time` tăng dần (đúng Đầu ra C1).
 */
async function queryFlightsByLeg({ origin, destination, date }) {
  const { start, end } = dayRangeVN(date);

  return Flight.aggregate([
    {
      $match: {
        origin_code: origin,
        dest_code: destination,
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

/**
 * C1 — tìm kiếm chuyến bay. Với khứ hồi, query 2 lần (ghi chú kỹ thuật C1):
 * chặng đi (origin→destination, departure_date) và chặng về (destination→
 * origin, return_date, origin/destination ĐẢO CHIỀU).
 *
 * `passenger_count` KHÔNG dùng để lọc bớt chuyến khỏi kết quả (tài liệu
 * không yêu cầu ẩn chuyến thiếu chỗ) — mỗi chuyến trả kèm `available_seats`
 * để client tự quyết định hiển thị cảnh báo/khóa nút đặt nếu không đủ ghế
 * cho `passenger_count`, tránh hệ thống âm thầm giấu bớt lựa chọn của khách.
 *
 * @param {Object} params
 * @param {String} params.origin - Airport.code điểm đi
 * @param {String} params.destination - Airport.code điểm đến
 * @param {String|Date} params.departureDate
 * @param {"one_way"|"round_trip"} params.tripType
 * @param {String|Date} [params.returnDate] - bắt buộc nếu round_trip
 * @param {Number} [params.passengerCount]
 * @returns {Promise<{ outbound: Array, return: Array|null }>}
 */
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
  if (!["one_way", "round_trip"].includes(tripType)) {
    throw new FlightError("trip_type phải là 'one_way' hoặc 'round_trip'.");
  }
  if (tripType === "round_trip" && !returnDate) {
    throw new FlightError("Vé khứ hồi bắt buộc phải có return_date.");
  }
  if (passengerCount !== undefined && (!Number.isInteger(passengerCount) || passengerCount < 1)) {
    throw new FlightError("passenger_count phải là số nguyên >= 1.");
  }

  const outbound = await queryFlightsByLeg({ origin, destination, date: departureDate });

  if (tripType === "one_way") {
    return { outbound, return: null };
  }

  const returnLeg = await queryFlightsByLeg({ origin: destination, destination: origin, date: returnDate });
  return { outbound, return: returnLeg };
}

/**
 * C3 — chi tiết 1 chuyến bay. Trả FULL `seats[]` (khác `searchFlights` ở
 * trên) vì C4/C5 (nhập hành khách + chọn ghế) diễn ra NGAY TRÊN CÙNG màn
 * hình chi tiết này (theo ma trận phụ thuộc mục 5) — cần sẵn seat map đầy đủ
 * để vẽ sơ đồ ghế, không cần gọi thêm API riêng.
 *
 * @returns {Promise<Object>} Flight doc, có populate airline_id/aircraft_id
 * @throws {FlightError} 404 nếu không tồn tại
 */
async function getFlightDetail(flightId) {
  const flight = await Flight.findById(flightId)
    .populate("airline_id", "code name")
    .populate("aircraft_id", "name");

  if (!flight) {
    throw new FlightError("Không tìm thấy chuyến bay.", 404);
  }

  return flight;
}

module.exports = {
  FlightError,
  searchFlights,
  getFlightDetail,
};