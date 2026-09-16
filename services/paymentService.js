// services/paymentService.js
//
// C6 — logic nghiệp vụ thanh toán, dựng trên lib/momoClient.js (chỉ lo phần
// HTTP + chữ ký). File này quyết định khi nào đổi Booking.status, khi nào
// confirm/nhả ghế — đúng ranh giới lib/ (giao tiếp ngoài) vs services/
// (nghiệp vụ) đã áp dụng cho lib/emailClient.js + services/ticketService.js.
//
// 2 luồng:
// 1) initiatePayment()  — POST /api/payments/[bookingId]: khách bấm "Thanh
//    toán", tạo yêu cầu thanh toán bên Momo, trả payUrl để redirect/hiện QR.
// 2) handleWebhook()    — cũng POST /api/payments/[bookingId] (Momo gọi
//    ngầm, IPN): xử lý kết quả thật, đổi status Booking + ghế.
//
// Race-condition webhook (ghi chú y): dựa thẳng vào điều kiện atomic có sẵn
// trong seatService.confirmAllSeatsBooked() (status: held, held_by: userId
// ngay trong query) làm "trọng tài" — KHÔNG tự kiểm tra payment_expires_at
// thủ công ở đây, tránh 2 nơi tính điều kiện có thể lệch nhau. Nếu ghế đã bị
// cron nhả hoặc bị người khác giữ/đặt trước khi webhook về, điều kiện đó tự
// fail → không ghi đè 'confirmed'.

const Booking = require("../models/Booking");
const seatService = require("./seatService");
const ticketService = require("./ticketService");
const momoClient = require("../lib/momoClient");
const { nowVN } = require("../lib/timezone");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class PaymentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// ObjectId của Mongo luôn là chuỗi hex 24 ký tự, không chứa dấu '-' — an
// toàn để lấy 24 ký tự đầu của orderId làm bookingId (xem buildOrderId).
const OBJECT_ID_LENGTH = 24;

/**
 * orderId gửi cho Momo = bookingId (24 ký tự) nối thêm mốc thời gian, để:
 * - webhook parse ngược lại đúng bookingId (parseBookingIdFromOrderId), và
 * - vẫn DUY NHẤT cho mỗi lần gọi nếu khách bấm "thanh toán lại" sau khi lần
 *   trước bị Momo báo `failed` (Momo yêu cầu orderId không trùng lần trước).
 */
function buildOrderId(bookingId) {
  return `${bookingId}-${Date.now()}`;
}

function parseBookingIdFromOrderId(orderId) {
  if (typeof orderId !== "string" || orderId.length < OBJECT_ID_LENGTH) return null;
  return orderId.slice(0, OBJECT_ID_LENGTH);
}

/** Gộp seats[] của mọi hành khách trong booking thành 1 danh sách {flightId, seatNumber}. */
function collectSeatRefs(booking) {
  return booking.passengers.flatMap((p) =>
    p.seats.map((s) => ({ flightId: s.flight_id, seatNumber: s.seat_number }))
  );
}

/**
 * C6 — khách bấm "Thanh toán": tạo yêu cầu thanh toán bên Momo cho 1 booking
 * đang `pending_payment`, trả về payUrl/deeplink/qrCodeUrl để FE hiển thị.
 *
 * KHÔNG đổi Booking.status ở bước này (vẫn `pending_payment` cho tới khi
 * webhook báo kết quả thật) — chỉ là bước "khởi tạo giao dịch" bên Momo.
 *
 * @param {Object} params
 * @param {String} params.bookingId
 * @param {String} params.baseUrl - origin của app (VD lấy từ `req.nextUrl.origin`
 *   ở route handler), dùng để build redirectUrl/ipnUrl tuyệt đối cho Momo
 * @param {String} [params.paymentMethod="momo"] - hệ thống chỉ hỗ trợ Momo (C6)
 * @param {String} [params.locale="vi"] - gắn vào redirectUrl để trang kết quả hiển thị đúng ngôn ngữ
 * @returns {Promise<{ payUrl: String, deeplink: String, qrCodeUrl: String, orderId: String }>}
 * @throws {PaymentError} 404 không tìm thấy booking, 409 booking không ở trạng thái
 *   chờ thanh toán hoặc đã hết hạn giữ ghế
 */
async function initiatePayment({ bookingId, baseUrl, paymentMethod = "momo", locale = "vi" }) {
  if (paymentMethod !== "momo") {
    throw new PaymentError("Hệ thống hiện chỉ hỗ trợ thanh toán qua Momo.", 400);
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new PaymentError("Không tìm thấy booking.", 404);
  }
  if (booking.status !== "pending_payment") {
    throw new PaymentError(
      `Booking đang ở trạng thái '${booking.status}', không thể tạo yêu cầu thanh toán.`,
      409
    );
  }
  // Chặn sớm ở tầng service, tránh gọi phí công sang Momo cho 1 giao dịch
  // gần như chắc chắn sẽ rơi vào payment_error_manual_refund khi webhook về
  // (xem ghi chú y) — dù cron job (ghi chú f) có thể chưa kịp quét nhả ghế.
  if (booking.payment.payment_expires_at && nowVN().toDate() > booking.payment.payment_expires_at) {
    throw new PaymentError(
      "Đã quá hạn giữ ghế cho booking này, vui lòng đặt lại từ đầu.",
      409
    );
  }

  const orderId = buildOrderId(bookingId);
  const redirectUrl = `${baseUrl}/${locale}/payment?bookingId=${bookingId}`;
  const ipnUrl = `${baseUrl}/api/payments/${bookingId}`;

  const momoResult = await momoClient.createPaymentRequest({
    orderId,
    amount: booking.total_amount,
    orderInfo: `Thanh toan ve may bay - Booking ${bookingId}`,
    redirectUrl,
    ipnUrl,
  });

  return {
    payUrl: momoResult.payUrl,
    deeplink: momoResult.deeplink,
    qrCodeUrl: momoResult.qrCodeUrl,
    orderId,
  };
}

/**
 * Nhánh THÀNH CÔNG của webhook — cố confirm toàn bộ ghế của booking, rồi ghi
 * kết quả THẬT (dù thành công toàn phần hay dính race-condition) vào
 * Booking, KHÔNG được throw để bỏ dở giữa chừng vì tiền đã bị Momo trừ thật.
 */
async function applySuccessfulPayment(booking, payload) {
  const seatRefs = collectSeatRefs(booking);
  const { allSucceeded } = await seatService.confirmAllSeatsBooked({
    seatRefs,
    userId: booking.user_id,
  });

  booking.payment.method = "momo";
  booking.payment.transaction_id = String(payload.transId);
  booking.payment.paid_at = nowVN().toDate();

  if (allSucceeded) {
    booking.status = "confirmed";
  } else {
    // Ghi chú (y): ghế đã mất do cron nhả hoặc bị người khác giữ/đặt trước —
    // TUYỆT ĐỐI không set 'confirmed'. Không rollback các ghế đã confirm
    // thành công (xem seatService.confirmAllSeatsBooked) vì tiền đã bị trừ
    // thật — cần admin xử lý hoàn tiền thủ công (A3), theo đúng ngoại lệ duy
    // nhất cho phép nhập tay refund_amount.
    booking.status = "payment_error_manual_refund";
  }

  await booking.save();

  if (booking.status === "confirmed") {
    // Sinh booking_code + gửi vé điện tử ngay khi có thể — issueTicket()
    // idempotent theo booking_code và tự nuốt lỗi gửi email (xem
    // services/ticketService.js), không làm hỏng việc xác nhận thanh toán.
    await ticketService.issueTicket({ bookingId: String(booking._id) });
  }

  return booking;
}

/**
 * Nhánh THẤT BẠI của webhook (`resultCode !== 0` — khách hủy giao dịch trên
 * app Momo, QR hết hạn, hoặc lỗi thanh toán khác) — xử lý NGAY trong webhook,
 * không đợi cron job (ghi chú b) quét dọn sau 30 phút, để giải phóng ghế sớm
 * cho khách khác.
 */
async function applyFailedPayment(booking) {
  const seatRefs = collectSeatRefs(booking);
  for (const { flightId, seatNumber } of seatRefs) {
    await seatService.forceReleaseSeat({ flightId, seatNumber });
  }
  booking.status = "cancelled";
  booking.cancel_reason = "Thanh toán Momo thất bại hoặc bị khách hủy trên app Momo.";
  await booking.save();
  return booking;
}

/**
 * C6 — xử lý IPN webhook Momo POST tới `/api/payments/[bookingId]`.
 *
 * IDEMPOTENT: Momo có thể gửi lại cùng 1 IPN nhiều lần — nếu booking đã ra
 * khỏi `pending_payment` (do lần gọi webhook trước đó, hoặc cron job đã hủy),
 * hàm coi như no-op và trả về booking hiện tại, KHÔNG chạy lại
 * confirmAllSeatsBooked lần 2 (lần 2 sẽ luôn fail vì ghế đã 'booked' chứ
 * không còn 'held', dễ bị hiểu nhầm thành race-condition thật và rơi oan vào
 * payment_error_manual_refund).
 *
 * @param {Object} payload - JSON body Momo gửi (đã JSON.parse ở route handler)
 * @returns {Promise<Object>} Booking doc sau xử lý
 * @throws {PaymentError} 400 nếu chữ ký không hợp lệ hoặc orderId sai định dạng,
 *   404 nếu không tìm thấy booking tương ứng
 */
async function handleWebhook(payload) {
  if (!momoClient.verifyIpnSignature(payload)) {
    throw new PaymentError("Chữ ký webhook Momo không hợp lệ.", 400);
  }

  const bookingId = parseBookingIdFromOrderId(payload.orderId);
  if (!bookingId) {
    throw new PaymentError(`orderId không hợp lệ: '${payload.orderId}'.`, 400);
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new PaymentError(`Không tìm thấy booking cho orderId '${payload.orderId}'.`, 404);
  }

  if (booking.status !== "pending_payment") {
    // No-op có chủ đích — xem JSDoc phía trên (idempotent trước IPN gửi lại).
    return booking;
  }

  const isSuccess = payload.resultCode === 0;
  return isSuccess ? applySuccessfulPayment(booking, payload) : applyFailedPayment(booking);
}

module.exports = {
  PaymentError,
  buildOrderId,
  parseBookingIdFromOrderId,
  initiatePayment,
  handleWebhook,
};