const Booking = require("../models/Booking");
const Flight = require("../models/Flight");
const { PAYMENT_MIN_AMOUNT, PAYMENT_MAX_AMOUNT } = require("../config/constants");
const { assertSeatIsHeldByUser } = require("./bookingValidationService");
const seatService = require("./seatService");
const ticketService = require("./ticketService");
const vnpayClient = require("../lib/vnpayClient");
const { nowVN } = require("../lib/timezone");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class PaymentError extends Error {
  constructor(message, statusCode = 400, rspCode = "99") {
    super(message);
    this.statusCode = statusCode;
    this.rspCode = rspCode;
  }
}

// Phương thức thanh toán (giá trị lưu ở Booking.payment.method).
const PAYMENT_METHODS = Object.freeze({ vnpay: "vnpay" });
const DEFAULT_PAYMENT_METHOD = "vnpay";

// ObjectId của Mongo luôn là chuỗi hex 24 ký tự — an toàn để lấy 24 ký tự đầu của mã đơn hàng làm bookingId.
const OBJECT_ID_LENGTH = 24;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/** Mã đơn hàng gửi VNPay (vnp_TxnRef) = bookingId (24 ký tự) nối mốc thời gian, chỉ gồm chữ + số, để. */
function buildOrderId(bookingId) {
  return `${bookingId}${Date.now()}`;
}

function parseBookingIdFromOrderId(orderId) {
  if (typeof orderId !== "string" || orderId.length < OBJECT_ID_LENGTH) return null;
  const id = orderId.slice(0, OBJECT_ID_LENGTH);
  return OBJECT_ID_RE.test(id) ? id : null;
}

/** Gộp seats[] của mọi hành khách trong booking thành 1 danh sách {flightId, seatNumber}. */
function collectSeatRefs(booking) {
  return booking.passengers.flatMap((p) =>
    p.seats.map((s) => ({ flightId: s.flight_id, seatNumber: s.seat_number }))
  );
}

/** Mọi ghế của booking phải còn `held` bởi chính chủ booking và chưa quá hạn (xem assertSeatIsHeldByUser). */
async function assertBookingSeatsStillHeld(booking) {
  const refs = collectSeatRefs(booking);
  const flightIds = [...new Set(refs.map((r) => String(r.flightId)))];
  const flights = await Flight.find({ _id: { $in: flightIds } }, "seats");
  const byId = new Map(flights.map((f) => [String(f._id), f]));
  try {
    for (const { flightId, seatNumber } of refs) {
      const flight = byId.get(String(flightId));
      if (!flight) throw new Error("flight");
      assertSeatIsHeldByUser(flight, seatNumber, booking.user_id);
    }
  } catch {
    throw new PaymentError(
      "Ghế của booking đã hết hạn giữ hoặc không còn thuộc về bạn — vui lòng đặt lại từ đầu.",
      409
    );
  }
}

/** C6 — khách bấm "Thanh toán": dựng URL thanh toán VNPay cho 1 booking đang `pending_payment`. */
async function initiatePayment({
  bookingId,
  baseUrl,
  ipAddr,
  paymentMethod = DEFAULT_PAYMENT_METHOD,
  locale = "vi",
}) {
  // Object.hasOwn: tránh các key kế thừa như "constructor"/"__proto__" lọt qua bước kiểm tra chỉ vì tồn tại trên…
  if (typeof paymentMethod !== "string" || !Object.hasOwn(PAYMENT_METHODS, paymentMethod)) {
    throw new PaymentError(
      `Phương thức thanh toán không được hỗ trợ (chỉ nhận: ${Object.keys(PAYMENT_METHODS).join(", ")}).`,
      400
    );
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
  // Chặn sớm ở tầng service, tránh tạo giao dịch gần như chắc chắn sẽ rơi vào payment_error_manual_refund khi IPN…
  const expiresAt = booking.payment?.payment_expires_at;
  if (expiresAt && nowVN().toDate() > expiresAt) {
    throw new PaymentError(
      "Đã quá hạn giữ ghế cho booking này, vui lòng đặt lại từ đầu.",
      409
    );
  }

  // Ghế phải còn được user này giữ — nếu không, khách trả tiền xong mới phát hiện mất ghế và phải hoàn tay.
  await assertBookingSeatsStillHeld(booking);

  // VNPay chỉ nhận số tiền trong khoảng giới hạn — ngoài khoảng này VNPay từ chối nhưng booking đã tạo.
  if (booking.total_amount < PAYMENT_MIN_AMOUNT || booking.total_amount > PAYMENT_MAX_AMOUNT) {
    throw new PaymentError(
      `Tổng tiền ${booking.total_amount.toLocaleString("vi-VN")}đ nằm ngoài giới hạn thanh toán VNPay (${PAYMENT_MIN_AMOUNT.toLocaleString("vi-VN")}–${PAYMENT_MAX_AMOUNT.toLocaleString("vi-VN")}đ).`,
      400
    );
  }

  const orderId = buildOrderId(bookingId);
  // Return URL không kèm query (?bookingId=...) — VNPay tự nối tham số vnp_* vào sau.
  const returnUrl = `${baseUrl}/${locale}/payment`;

  const { payUrl, createDate } = vnpayClient.createPaymentUrl({
    txnRef: orderId,
    amount: booking.total_amount,
    // Tiếng Việt không dấu, không ký tự đặc biệt — theo khuyến nghị của VNPay.
    orderInfo: `Thanh toan ve may bay booking ${bookingId}`,
    returnUrl,
    ipAddr,
    locale,
    // Link thanh toán hết hạn cùng lúc với hạn thanh toán của booking (ghi chú y).
    expireDate: expiresAt || undefined,
  });

  // Ghi nhớ phương thức + mã đơn hàng vừa tạo (không đụng status).
  await Booking.updateOne(
    { _id: bookingId, status: "pending_payment" },
    {
      $set: {
        "payment.method": paymentMethod,
        "payment.last_order_id": orderId,
        "payment.last_order_date": createDate,
      },
    }
  );

  return { payUrl, orderId };
}

/** Nhả các ghế (held/booked bởi chính chủ booking) — idempotent, an toàn gọi nhiều lần. */
async function releaseSeatRefs(booking, seatRefs) {
  for (const { flightId, seatNumber } of seatRefs) {
    await seatService.forceReleaseSeat({ flightId, seatNumber, userId: booking.user_id });
  }
}

/** Ghế "thất bại" khi confirm có thể chỉ là do luồng song song. */
async function isSeatLostForReal(booking, { flightId, seatNumber }) {
  const bookedBySame = await seatService.isSeatBookedBy({ flightId, seatNumber, userId: booking.user_id });
  if (!bookedBySame) return true;
  const other = await Booking.exists({
    _id: { $ne: booking._id },
    status: { $in: ["confirmed", "payment_error_manual_refund"] },
    passengers: { $elemMatch: { seats: { $elemMatch: { flight_id: flightId, seat_number: seatNumber } } } },
  });
  return Boolean(other);
}

/** Ghi nhận thanh toán đã được VNPAY xác nhận. */
async function applySuccessfulPayment(booking, paid) {
  const claim = async (status) =>
    Booking.findOneAndUpdate(
      { _id: booking._id, status: "pending_payment" },
      {
        $set: {
          status,
          "payment.method": booking.payment?.method || DEFAULT_PAYMENT_METHOD,
          "payment.transaction_id": String(paid.transId),
          "payment.paid_at": nowVN().toDate(),
        },
      },
      { returnDocument: "after" }
    );

  const seatRefs = collectSeatRefs(booking);

  // Số tiền VNPay thu khác tổng booking (không xảy ra với giao dịch do chính server tạo): không confirm ghế.
  if (Number(paid.amount) !== booking.total_amount) {
    const won = await claim("payment_error_manual_refund");
    if (!won) return Booking.findById(booking._id);
    await releaseSeatRefs(booking, seatRefs);
    return won;
  }

  const { failedSeats } = await seatService.confirmAllSeatsBooked({ seatRefs, userId: booking.user_id });
  const confirmedRefs = seatRefs.filter(
    (r) => !failedSeats.some((f) => String(f.flightId) === String(r.flightId) && f.seatNumber === r.seatNumber)
  );

  let seatsLost = false;
  for (const f of failedSeats) {
    if (await isSeatLostForReal(booking, f)) {
      seatsLost = true;
      break;
    }
  }

  // Ghi chú (y): mất ghế thật -> tuyệt đối không 'confirmed'; không rollback ghế đã confirm vì tiền đã trừ thật.
  const won = await claim(seatsLost ? "payment_error_manual_refund" : "confirmed");

  if (!won) {
    // Thua race ghi status.
    const fresh = await Booking.findById(booking._id);
    if (fresh && fresh.status === "cancelled") {
      await releaseSeatRefs(booking, confirmedRefs);
      return applyLatePayment(fresh, { transId: paid.transId });
    }
    return fresh;
  }

  if (won.status === "confirmed") {
    // issueTicket() idempotent theo booking_code, tự nuốt lỗi gửi email.
    await ticketService.issueTicket({ bookingId: String(won._id) });
  }
  return won;
}

/** Nhánh thất bại (VNPay xác nhận thất bại dứt khoát). */
async function applyFailedPayment(booking) {
  const won = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending_payment" },
    {
      $set: {
        status: "cancelled",
        cancel_reason: "Thanh toán VNPay thất bại hoặc bị khách hủy trên trang thanh toán VNPay.",
      },
    },
    { returnDocument: "after" }
  );
  if (!won) return Booking.findById(booking._id);
  await releaseSeatRefs(booking, collectSeatRefs(booking));
  return won;
}

/** Quyết định webhook cần làm gì — hàm thuần (không đụng DB) để test được. */
function decideWebhookAction({ status, paid, hasTransactionId, transId, storedTransId }) {
  if (status === "pending_payment") {
    return paid ? "confirm" : "fail";
  }
  if (status === "cancelled" && paid && !hasTransactionId) {
    return "late_payment_error";
  }
  // Thanh toán thành công thêm lần nữa trên 1 booking đã chốt.
  if (
    paid &&
    hasTransactionId &&
    transId !== undefined &&
    String(transId) !== String(storedTransId) &&
    ["confirmed", "payment_error_manual_refund", "refunded", "cancelled"].includes(status)
  ) {
    return "duplicate_payment";
  }
  return "noop";
}

/** Ghi nhận khoản thanh toán thừa (trả 2 lần cho 1 booking) vào payment.extra_payments để admin hoàn tay. */
async function applyDuplicatePayment(booking, { transId, orderId, amount }) {
  await Booking.updateOne(
    {
      _id: booking._id,
      "payment.transaction_id": { $ne: transId },
      "payment.extra_payments.trans_id": { $ne: transId },
    },
    {
      $push: {
        "payment.extra_payments": {
          trans_id: transId,
          order_id: String(orderId),
          amount: Number(amount),
          received_at: nowVN().toDate(),
        },
      },
    }
  );
  console.error(
    `[webhook] THANH TOÁN TRÙNG: bookingId=${booking._id}, transId=${transId}, amount=${amount} — cần hoàn tiền tay.`
  );
  return booking;
}

/** Tiền đã bị trừ nhưng booking đã `cancelled`. */
async function applyLatePayment(booking, { transId }) {
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "cancelled", "payment.transaction_id": { $exists: false } },
    {
      $set: {
        status: "payment_error_manual_refund",
        "payment.method": booking.payment?.method || DEFAULT_PAYMENT_METHOD,
        "payment.transaction_id": String(transId),
        "payment.paid_at": nowVN().toDate(),
      },
    },
    { returnDocument: "after" }
  );
  return updated || (await Booking.findById(booking._id));
}

/** Trang kết quả thanh toán (Return URL) gọi mỗi khi khách quay lại. */
async function syncPaymentStatus(bookingId) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status !== "pending_payment") return booking;

  const txnRef = booking.payment?.last_order_id;
  const transactionDate = booking.payment?.last_order_date;
  if (!txnRef || !transactionDate) return booking;

  let result;
  try {
    result = await vnpayClient.queryTransaction({ txnRef, transactionDate });
  } catch (err) {
    console.error("[payment] syncPaymentStatus: không truy vấn được VNPay:", err.message);
    return booking;
  }

  try {
    if (result.status === "success" && result.transId !== undefined) {
      return await applySuccessfulPayment(booking, { transId: result.transId, amount: result.amount });
    }
    if (result.status === "failed") {
      return await applyFailedPayment(booking);
    }
    return booking;
  } catch (err) {
    console.error("[payment] syncPaymentStatus: lỗi khi ghi nhận kết quả thanh toán:", err);
    return Booking.findById(bookingId);
  }
}

/** C6 — xử lý IPN VNPay gửi tới `GET /api/payments/vnpay-ipn` (URL cấu hình ở trang quản trị merchant). */
async function handleWebhook(query) {
  if (!vnpayClient.verifyReturnParams(query)) {
    throw new PaymentError("Chữ ký IPN VNPay không hợp lệ.", 400, "97");
  }

  const result = vnpayClient.normalizeResult(query);
  const bookingId = parseBookingIdFromOrderId(result.txnRef);
  if (!bookingId) {
    throw new PaymentError(`Mã đơn hàng không hợp lệ: '${result.txnRef}'.`, 404, "01");
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new PaymentError(`Không tìm thấy booking cho mã đơn hàng '${result.txnRef}'.`, 404, "01");
  }

  const paid = result.status === "success";

  // VNPay báo giao dịch chưa hoàn tất — chưa có gì để chốt; trả lỗi để VNPay gửi lại sau.
  if (result.status === "pending") {
    throw new PaymentError("Giao dịch VNPay chưa hoàn tất.", 503, "99");
  }

  // Số tiền trong IPN phải đúng tổng tiền booking (chữ ký đúng nhưng số tiền lệch = dữ liệu bất thường).
  if (result.amount !== booking.total_amount) {
    console.error(`[webhook] SAI SỐ TIỀN: bookingId=${booking._id}, VNPay=${result.amount}, booking=${booking.total_amount}`);
    throw new PaymentError("Số tiền không khớp booking.", 400, "04");
  }

  // Lọc IPN thất bại lỗi thời: mã đơn hàng không khớp lần thanh toán cuối.
  const lastOrderId = booking.payment?.last_order_id;
  if (!paid && lastOrderId && result.txnRef !== lastOrderId) {
    return { booking, rspCode: "00" };
  }
  // Thất bại nhưng không phải lỗi dứt khoát (trạng thái lạ) — không tự hủy booking.
  if (!paid && result.status !== "failed") {
    console.error(`[webhook] IPN trạng thái lạ (${result.responseCode}/${result.transactionStatus}), bỏ qua: bookingId=${booking._id}`);
    return { booking, rspCode: "00" };
  }

  const action = decideWebhookAction({
    status: booking.status,
    paid,
    hasTransactionId: Boolean(booking.payment?.transaction_id),
    transId: result.transId,
    storedTransId: booking.payment?.transaction_id,
  });

  switch (action) {
    case "confirm":
      if (result.transId === undefined) {
        throw new PaymentError("IPN thành công nhưng thiếu mã giao dịch VNPay.", 400, "99");
      }
      return { booking: await applySuccessfulPayment(booking, result), rspCode: "00" };
    case "fail":
      return { booking: await applyFailedPayment(booking), rspCode: "00" };
    case "late_payment_error":
      return { booking: await applyLatePayment(booking, result), rspCode: "00" };
    case "duplicate_payment":
      return {
        booking: await applyDuplicatePayment(booking, { transId: result.transId, orderId: result.txnRef, amount: result.amount }),
        rspCode: "00",
      };
    default:
      // IPN lặp lại cho booking đã chốt — VNPay quy ước mã "02" (đơn đã được xác nhận).
      return { booking, rspCode: booking.status === "pending_payment" ? "00" : "02" };
  }
}

module.exports = {
  PaymentError,
  PAYMENT_METHODS,
  buildOrderId,
  parseBookingIdFromOrderId,
  decideWebhookAction,
  initiatePayment,
  handleWebhook,
  syncPaymentStatus,
};
