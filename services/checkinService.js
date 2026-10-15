// services/checkinService.js
//
// C10 — check-in online, làm giống website hãng bay: KHÔNG cần đăng nhập. (1) khách nhập MÃ ĐẶT CHỖ
// (mã vé điện tử, Booking.booking_code) + HỌ của một hành khách để tra cứu, (2) chọn hành khách + chặng
// bay, (3) đồng ý quy định ICI, (4) check-in các ghế đã chọn và nhận thẻ lên máy bay.
//
// Phần GHI Flight.seats[] (atomic, kiểm tra chuyến hủy/khung giờ, chống double check-in) ủy quyền
// cho `seatService.checkInSeat()` (mọi thao tác đọc/ghi seats[] tập trung ở seatService.js). File
// này lo: xác thực mã + họ tên, dựng danh sách ghế để hiển thị, và nội dung thẻ lên máy bay theo
// `Booking.locale` (cùng quy tắc với vé điện tử C7).
//
// API liên quan: POST /api/check-in/lookup, POST /api/flights/[id]/check-in

const Booking = require("../models/Booking");
const Flight = require("../models/Flight");
const User = require("../models/User");
const seatService = require("./seatService");
const { assertValidSeatNumber } = require("./seatService");
const { boardingPassLabels, boardingTimeFor } = require("../lib/boardingPass");
const { normalizeBookingCode, normalizePassengerName, passengerNameMatches } = require("../lib/bookingCode");
const { checkInWindowState } = require("../lib/timezone");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class CheckinError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Cùng 1 thông báo cho "sai mã" và "đúng mã nhưng sai tên" — không cho người dò biết mã nào tồn tại.
const NOT_FOUND_MESSAGE = "Không tìm thấy vé đã thanh toán khớp với mã đặt chỗ và họ hành khách này.";

/**
 * Tìm booking `confirmed` theo mã đặt chỗ + HỌ (hoặc họ tên) của ít nhất 1 hành khách — như website
 * hãng bay, xem lib/bookingCode.passengerNameMatches; không phân biệt hoa/thường/dấu. Tài khoản đặt vé bị khóa thì không cho check-in (ghi chú q).
 *
 * @throws {CheckinError} 400 thiếu/sai định dạng, 404 không khớp, 403 tài khoản đặt vé bị khóa
 */
async function findBookingByCodeAndName({ bookingCode, passengerName }) {
  const code = normalizeBookingCode(bookingCode);
  const name = normalizePassengerName(passengerName);
  if (!code || !name) {
    throw new CheckinError("Vui lòng nhập đúng mã đặt chỗ (6 ký tự) và họ của một hành khách.", 400);
  }

  const booking = await Booking.findOne({ booking_code: code, status: "confirmed" });
  const nameMatches = booking?.passengers.some((p) => passengerNameMatches(p.full_name, name));
  if (!booking || !nameMatches) {
    throw new CheckinError(NOT_FOUND_MESSAGE, 404);
  }

  const owner = await User.findById(booking.user_id, "is_blocked");
  if (!owner || owner.is_blocked) {
    throw new CheckinError("Không thể check-in cho booking này, vui lòng liên hệ hãng.", 403);
  }
  return booking;
}

/**
 * Booking (đã populate passengers.seats.flight_id kèm seats[]) -> danh sách phẳng 1 dòng / 1 ghế, kèm
 * trạng thái hiển thị. Chuyến bị hãng hủy (booking có thể vẫn `confirmed` tới khi admin chạy A8) ->
 * không cho check-in; trạng thái khung giờ tính sẵn ở server để client không tự suy luận sai.
 */
function buildCheckInItems(booking) {
  const items = [];
  for (const passenger of booking.passengers) {
    for (const seatRef of passenger.seats) {
      const flight = seatRef.flight_id; // đã populate — object Flight đầy đủ
      if (!flight || !flight.seats) continue; // chuyến bay đã bị xóa hẳn

      const seatDoc = flight.seats.find((s) => s.seat_number === seatRef.seat_number);
      if (!seatDoc) continue;

      const flightCancelled = flight.status === "cancelled";
      const windowState = checkInWindowState(flight.departure_time);
      items.push({
        bookingCode: booking.booking_code,
        bookingLocale: booking.locale,
        flightId: String(flight._id),
        flightNumber: flight.flight_number,
        originCode: flight.origin_code,
        destCode: flight.dest_code,
        departureTime: flight.departure_time,
        boardingTime: boardingTimeFor(flight.departure_time),
        seatNumber: seatRef.seat_number,
        seatClass: seatRef.seat_class,
        passengerName: passenger.full_name,
        checkedIn: seatDoc.checked_in === true,
        checkedInAt: seatDoc.checked_in_at,
        boardingPassCode: seatDoc.boarding_pass_code,
        flightCancelled,
        windowState,
      });
    }
  }
  // Sắp theo giờ bay gần nhất trước, rồi theo tên hành khách.
  items.sort(
    (a, b) => new Date(a.departureTime) - new Date(b.departureTime) || a.passengerName.localeCompare(b.passengerName)
  );
  return items;
}

/**
 * Bước 1 của check-in: tra cứu bằng mã đặt chỗ + họ tên, trả về mọi ghế của booking (mọi hành khách,
 * mọi chặng) — giống website hãng: 1 người trong đoàn có thể làm thủ tục cho cả đoàn.
 */
async function lookupForCheckIn({ bookingCode, passengerName }) {
  const booking = await findBookingByCodeAndName({ bookingCode, passengerName });
  await Booking.populate(booking, {
    path: "passengers.seats.flight_id",
    select: "flight_number origin_code dest_code departure_time status seats",
  });
  return buildCheckInItems(booking);
}

/**
 * Bước 2: check-in 1 ghế, trả về dữ liệu thẻ lên máy bay + bộ nhãn theo Booking.locale.
 *
 * THỨ TỰ CỐ Ý: xác thực mã + họ tên và kiểm tra ghế thuộc booking TRƯỚC khi gọi
 * `seatService.checkInSeat()` — sai thì từ chối sớm, không ghi `checked_in: true` vào DB.
 *
 * @param {Object} params
 * @param {String} params.flightId
 * @param {String} params.seatNumber
 * @param {String} params.bookingCode - mã đặt chỗ khách nhập
 * @param {String} params.passengerName - họ (hoặc họ tên) 1 hành khách trong booking
 * @param {Boolean} params.iciAccepted - khách đã đồng ý quy định ICI (bắt buộc true)
 * @returns {Promise<Object>} dữ liệu thẻ lên máy bay (lib/boardingPass.js)
 * @throws {CheckinError} 400/404/403 (xem findBookingByCodeAndName), 404 nếu ghế không thuộc booking
 * @throws {SeatConflictError} (ném từ seatService) 409 nếu chuyến đã hủy, ngoài khung giờ,
 *   ghế chưa `booked`, hoặc đã check-in rồi
 */
async function checkIn({ flightId, seatNumber, bookingCode, passengerName, iciAccepted }) {
  assertValidSeatNumber(seatNumber);
  // Bước 4 của làm thủ tục trực tuyến: khách phải đọc và đồng ý quy định ICI (hành khách, hành lý)
  // — kiểm tra ở server, không chỉ dựa vào nút trên giao diện. 422 (không phải 400) để lib/checkinGuard.js
  // không tính đây là 1 lần dò mã.
  if (iciAccepted !== true) {
    throw new CheckinError("Vui lòng đọc và đồng ý quy định làm thủ tục trực tuyến (ICI) trước khi check-in.", 422);
  }
  const booking = await findBookingByCodeAndName({ bookingCode, passengerName });

  const passenger = booking.passengers.find((p) =>
    p.seats.some((s) => String(s.flight_id) === String(flightId) && s.seat_number === seatNumber)
  );
  if (!passenger) {
    throw new CheckinError("Ghế này không thuộc mã đặt chỗ đã nhập.", 404);
  }
  const seatRef = passenger.seats.find((s) => String(s.flight_id) === String(flightId));

  // Ghế `booked` mang held_by = chủ tài khoản đặt vé (không phải người đang check-in).
  const { boardingPassCode, checkedInAt } = await seatService.checkInSeat({
    flightId,
    seatNumber,
    userId: booking.user_id,
  });

  const flight = await Flight.findById(flightId);
  return {
    locale: booking.locale,
    labels: boardingPassLabels(booking.locale),
    booking_code: booking.booking_code,
    boarding_pass_code: boardingPassCode,
    checked_in_at: checkedInAt,
    passenger_name: passenger.full_name,
    seat_number: seatNumber,
    seat_class: seatRef.seat_class,
    flight_number: flight.flight_number,
    origin_code: flight.origin_code,
    dest_code: flight.dest_code,
    departure_time: flight.departure_time,
    boarding_time: boardingTimeFor(flight.departure_time),
  };
}

module.exports = { CheckinError, findBookingByCodeAndName, buildCheckInItems, lookupForCheckIn, checkIn };
