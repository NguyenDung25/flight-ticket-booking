// services/checkinService.js
//
// C10 — check-in online. Phần GHI Flight.seats[] (atomic, kiểm tra khung giờ,
// chống double check-in) đã ủy quyền hoàn toàn cho `seatService.checkInSeat()`
// (đúng nguyên tắc "mọi thao tác đọc/ghi seats[] tập trung ở seatService.js").
// File này chỉ điều phối thêm bước tra `Booking` để:
//   1) xác nhận có 1 booking `confirmed` hợp lệ thực sự chứa ghế này, và
//   2) build nội dung boarding pass ĐÚNG NGÔN NGỮ khách đang dùng
//      (`Booking.locale` — cùng cách áp dụng với vé điện tử C7, xem
//      services/ticketService.js).
//
// API liên quan: POST /api/flights/[id]/check-in

const Booking = require("../models/Booking");
const Flight = require("../models/Flight");
const seatService = require("./seatService");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class CheckinError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const LABELS = {
  vi: {
    boarding_pass: "Thẻ lên máy bay",
    flight: "Chuyến bay",
    seat: "Ghế",
    passenger: "Hành khách",
    gate_note: "Vui lòng có mặt tại cổng ra máy bay trước giờ khởi hành.",
  },
  en: {
    boarding_pass: "Boarding Pass",
    flight: "Flight",
    seat: "Seat",
    passenger: "Passenger",
    gate_note: "Please be at the gate before departure.",
  },
};

/**
 * Tìm booking `confirmed` CHỨA đúng ghế này của ĐÚNG user đang check-in.
 *
 * CẦN THIẾT dù `seatService.checkInSeat()` đã tự xác minh `held_by` — hàm đó
 * chỉ chứng minh user có QUYỀN ghi vào ghế, KHÔNG cho biết `Booking.locale`
 * (để hiển thị boarding pass đúng ngôn ngữ) hay tên hành khách thật sự ngồi
 * ghế đó (KHÁC tên chủ tài khoản — 1 tài khoản có thể đặt vé cho nhiều hành
 * khách khác nhau, ghi chú áp dụng chung với C7).
 */
async function findBookingForSeat({ userId, flightId, seatNumber }) {
  const booking = await Booking.findOne({
    user_id: userId,
    status: "confirmed",
    "flights.flight_id": flightId,
    passengers: {
      $elemMatch: { seats: { $elemMatch: { flight_id: flightId, seat_number: seatNumber } } },
    },
  });
  if (!booking) {
    throw new CheckinError("Không tìm thấy booking hợp lệ chứa ghế này.", 404);
  }
  return booking;
}

/**
 * C10 — check-in 1 ghế, trả về dữ liệu boarding pass đã format theo đúng
 * ngôn ngữ khách đang dùng.
 *
 * THỨ TỰ CỐ Ý: tìm `Booking` hợp lệ TRƯỚC khi gọi `seatService.checkInSeat()`
 * — nếu không có booking `confirmed` nào khớp, từ chối SỚM (404) thay vì lỡ
 * ghi `checked_in: true` vào DB rồi mới phát hiện không đủ dữ liệu để hiển
 * thị boarding pass đàng hoàng cho khách.
 *
 * @param {Object} params
 * @param {String} params.flightId
 * @param {String} params.seatNumber
 * @param {String} params.userId
 * @returns {Promise<Object>} boarding pass đã format theo locale
 * @throws {CheckinError} 404 nếu không có booking hợp lệ chứa ghế này
 * @throws {SeatConflictError} (ném từ seatService) 409 nếu ngoài khung giờ,
 *   sai chủ ghế, ghế chưa `booked`, hoặc đã check-in rồi
 */
async function checkIn({ flightId, seatNumber, userId }) {
  const booking = await findBookingForSeat({ userId, flightId, seatNumber });

  const { boardingPassCode, checkedInAt } = await seatService.checkInSeat({
    flightId,
    seatNumber,
    userId,
  });

  const flight = await Flight.findById(flightId);
  const passenger = booking.passengers.find((p) =>
    p.seats.some((s) => String(s.flight_id) === String(flightId) && s.seat_number === seatNumber)
  );
  const labels = LABELS[booking.locale] || LABELS.vi;

  return {
    labels,
    boarding_pass_code: boardingPassCode,
    checked_in_at: checkedInAt,
    passenger_name: passenger.full_name,
    seat_number: seatNumber,
    flight_number: flight.flight_number,
    origin_code: flight.origin_code,
    dest_code: flight.dest_code,
    departure_time: flight.departure_time,
  };
}

module.exports = { CheckinError, checkIn };