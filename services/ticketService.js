// services/ticketService.js
//
// C7 — sau khi thanh toán thành công (Booking.status = 'confirmed'), sinh
// booking_code duy nhất + gửi vé điện tử qua email đúng ngôn ngữ khách đang
// dùng (Booking.locale, chụp lại User.preferred_language lúc đặt vé).
//
// API liên quan: GET /api/bookings/[id]/ticket

const crypto = require("crypto");
const Booking = require("../models/Booking");
const Flight = require("../models/Flight");
const User = require("../models/User");
const emailClient = require("../lib/emailClient");
const {
  BOOKING_CODE_LENGTH,
  BOOKING_CODE_MAX_GENERATION_ATTEMPTS,
} = require("../config/constants");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class TicketError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Bỏ các ký tự dễ đọc nhầm khi khách đọc mã cho người khác hoặc gõ tay lại:
// I/1 (chữ I hoa và số 1), O/0 (chữ O hoa và số 0).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  let code = "";
  for (let i = 0; i < BOOKING_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Sinh `booking_code` ngẫu nhiên, DUY NHẤT — thử tối đa
 * `BOOKING_CODE_MAX_GENERATION_ATTEMPTS` lần, mỗi lần check trùng qua DB.
 * Index `unique + sparse` ở `Booking` model (mục 6) là lớp bảo vệ CUỐI chống
 * race-condition giữa lúc check và lúc save, KHÔNG thay thế bước check này —
 * bước check ở đây giúp tránh crash do lỗi duplicate key thô khi 2 request
 * cùng lúc random trúng y hệt 1 mã (xác suất cực thấp nhưng không phải 0).
 *
 * @throws {TicketError} 500 nếu thử hết số lần vẫn không ra mã trống
 */
async function generateUniqueBookingCode() {
  for (let attempt = 0; attempt < BOOKING_CODE_MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = randomCode();
    const taken = await Booking.exists({ booking_code: code });
    if (!taken) return code;
  }
  throw new TicketError(
    "Không sinh được mã đặt chỗ duy nhất sau nhiều lần thử, vui lòng thử lại.",
    500
  );
}

/** Trả về map { [flightId]: FlightDoc } cho các chặng trong booking. */
async function loadFlightMap(booking) {
  const flightIds = booking.flights.map((f) => f.flight_id);
  const flightDocs = await Flight.find({ _id: { $in: flightIds } });
  return Object.fromEntries(flightDocs.map((f) => [String(f._id), f]));
}

/**
 * Build dữ liệu vé dạng thuần (plain object) — dùng chung cho cả template
 * email (`lib/emailClient.js`) lẫn response JSON của
 * `GET /api/bookings/[id]/ticket` (route tự quyết định trả nguyên object này
 * hay chọn lọc field), tránh viết trùng logic gộp dữ liệu ở 2 nơi.
 */
async function buildTicketData(booking) {
  const flightMap = await loadFlightMap(booking);

  const legs = booking.flights.map((leg) => {
    const flightDoc = flightMap[String(leg.flight_id)];
    return {
      leg: leg.leg,
      flight_number: flightDoc.flight_number,
      origin_code: flightDoc.origin_code,
      dest_code: flightDoc.dest_code,
      departure_time: flightDoc.departure_time,
      arrival_time: flightDoc.arrival_time,
      amount: leg.amount,
    };
  });

  const passengers = booking.passengers.map((p) => ({
    full_name: p.full_name,
    document_type: p.document_type,
    document_id: p.document_id,
    seats: p.seats.map((s) => ({
      flight_id: s.flight_id,
      seat_number: s.seat_number,
      seat_class: s.seat_class,
    })),
  }));

  return {
    booking_id: String(booking._id),
    booking_code: booking.booking_code,
    trip_type: booking.trip_type,
    locale: booking.locale,
    total_amount: booking.total_amount,
    legs,
    passengers,
  };
}

/**
 * C7 — hàm tổng hợp: sinh `booking_code` (nếu chưa có) + gửi email vé điện
 * tử. IDEMPOTENT theo `booking_code` — gọi lại nhiều lần (VD khách bấm "Xem
 * lại vé" ở `GET /api/bookings/[id]/ticket`) KHÔNG sinh mã mới lần 2.
 *
 * Chỉ gửi email khi XUẤT VÉ LẦN ĐẦU (`booking_code` chưa từng có), hoặc khi
 * `resend: true` được truyền vào TƯỜNG MINH (VD khách bấm nút riêng "Gửi lại
 * vé qua email") — tránh gửi lại mỗi lần khách chỉ mở trang xem vé để xem.
 *
 * Email là phần "nên có" theo tài liệu (không phải điều kiện bắt buộc để có
 * vé hợp lệ) — nếu gửi email THẤT BẠI (SMTP lỗi, sai cấu hình...), hàm KHÔNG
 * ném lỗi và KHÔNG chặn việc trả `booking_code` cho khách; chỉ báo lại qua
 * `emailSent: false` để route/UI tự quyết định hiển thị cảnh báo hay không.
 *
 * @param {Object} params
 * @param {String} params.bookingId
 * @param {Boolean} [params.resend=false]
 * @returns {Promise<{ booking: Object, ticketData: Object, emailSent: Boolean }>}
 * @throws {TicketError} 404 nếu không tìm thấy booking/user, 409 nếu booking
 *   chưa `confirmed` (chưa thanh toán xong thì chưa có gì để xuất vé)
 */
async function issueTicket({ bookingId, resend = false }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new TicketError("Không tìm thấy booking.", 404);
  }
  if (booking.status !== "confirmed") {
    throw new TicketError(
      `Booking đang ở trạng thái '${booking.status}', chưa có vé để xuất.`,
      409
    );
  }

  const isFirstIssue = !booking.booking_code;
  if (isFirstIssue) {
    booking.booking_code = await generateUniqueBookingCode();
    await booking.save();
  }

  const ticketData = await buildTicketData(booking);

  let emailSent = false;
  if (isFirstIssue || resend) {
    const user = await User.findById(booking.user_id);
    if (!user) {
      // Trường hợp cực hiếm (user bị xóa cứng khỏi DB dù ngoài phạm vi đồ án
      // — hệ thống chỉ có is_blocked, không xóa User thật) — không chặn vé,
      // chỉ không gửi được email vì không biết gửi tới đâu.
      console.error(`Không tìm thấy User ${booking.user_id} để gửi vé điện tử.`);
    } else {
      try {
        await emailClient.sendTicketEmail({ to: user.email, ticketData });
        emailSent = true;
      } catch (err) {
        console.error("Gửi email vé điện tử thất bại:", err.message);
      }
    }
  }

  return { booking, ticketData, emailSent };
}

module.exports = {
  TicketError,
  generateUniqueBookingCode,
  buildTicketData,
  issueTicket,
};