// services/paymentService.js
//
// C6 — logic nghiệp vụ thanh toán, dựng trên lib/vnpayClient.js (chỉ lo phần
// chữ ký + HTTP). File này quyết định khi nào đổi Booking.status, khi nào
// confirm/nhả ghế — đúng ranh giới lib/ (giao tiếp ngoài) vs services/
// (nghiệp vụ) đã áp dụng cho lib/emailClient.js + services/ticketService.js.
//
// 3 luồng:
// 1) initiatePayment()   — POST /api/payments/[bookingId]: khách bấm "Thanh
//    toán", dựng URL thanh toán VNPay có chữ ký để redirect khách sang.
// 2) handleWebhook()     — GET /api/payments/vnpay-ipn (VNPay gọi ngầm, IPN):
//    xử lý kết quả thật, đổi status Booking + ghế.
// 3) syncPaymentStatus() — trang kết quả (Return URL): server hỏi lại VNPay
//    (querydr) để chốt booking khi IPN chưa/không về (VD chạy local không ngrok).
//
// Race-condition webhook (ghi chú y): dựa thẳng vào điều kiện atomic có sẵn
// trong seatService.confirmAllSeatsBooked() (status: held, held_by: userId
// ngay trong query) làm "trọng tài" — KHÔNG tự kiểm tra payment_expires_at
// thủ công ở đây, tránh 2 nơi tính điều kiện có thể lệch nhau. Nếu ghế đã bị
// cron nhả hoặc bị người khác giữ/đặt trước khi webhook về, điều kiện đó tự
// fail → không ghi đè 'confirmed'.

const Booking = require("../models/Booking");
const Flight = require("../models/Flight");
const { PAYMENT_MIN_AMOUNT, PAYMENT_MAX_AMOUNT } = require("../config/constants");
const { assertSeatIsHeldByUser } = require("./bookingValidationService");
const seatService = require("./seatService");
const ticketService = require("./ticketService");
const vnpayClient = require("../lib/vnpayClient");
const { nowVN } = require("../lib/timezone");

/**
 * Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. `rspCode` dùng riêng cho IPN:
 * mã phản hồi VNPay mong đợi (97 sai chữ ký, 01 không thấy đơn, 04 sai số tiền, 99 lỗi khác).
 */
class PaymentError extends Error {
  constructor(message, statusCode = 400, rspCode = "99") {
    super(message);
    this.statusCode = statusCode;
    this.rspCode = rspCode;
  }
}

// Phương thức thanh toán (giá trị lưu ở Booking.payment.method). Khách chọn ngân hàng/thẻ
// (ATM nội địa, thẻ quốc tế, QR...) ngay trên trang của VNPay.
const PAYMENT_METHODS = Object.freeze({ vnpay: "vnpay" });
const DEFAULT_PAYMENT_METHOD = "vnpay";

// ObjectId của Mongo luôn là chuỗi hex 24 ký tự — an toàn để lấy 24 ký tự đầu của mã đơn hàng làm
// bookingId (xem buildOrderId).
const OBJECT_ID_LENGTH = 24;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Mã đơn hàng gửi VNPay (vnp_TxnRef) = bookingId (24 ký tự) nối mốc thời gian, CHỈ gồm chữ + số, để:
 * - IPN parse ngược lại đúng bookingId (parseBookingIdFromOrderId), và
 * - vẫn DUY NHẤT cho mỗi lần thanh toán nếu khách bấm "thanh toán lại" (VNPay không nhận trùng
 *   vnp_TxnRef trong ngày).
 */
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

/**
 * C6 — khách bấm "Thanh toán": dựng URL thanh toán VNPay cho 1 booking đang `pending_payment`,
 * trả về payUrl để FE redirect.
 *
 * KHÔNG đổi Booking.status ở bước này (vẫn `pending_payment` cho tới khi IPN/truy vấn báo kết quả
 * thật) — chỉ là bước "khởi tạo giao dịch".
 *
 * @param {Object} params
 * @param {String} params.bookingId
 * @param {String} params.baseUrl - origin của app, dùng để build Return URL tuyệt đối cho VNPay
 * @param {String} [params.ipAddr] - IP của khách (VNPay bắt buộc vnp_IpAddr)
 * @param {String} [params.paymentMethod="vnpay"]
 * @param {String} [params.locale="vi"] - ngôn ngữ trang VNPay + trang kết quả
 * @returns {Promise<{ payUrl: String, orderId: String }>}
 * @throws {PaymentError} 404 không tìm thấy booking, 409 booking không ở trạng thái
 *   chờ thanh toán hoặc đã hết hạn giữ ghế, 400 số tiền ngoài giới hạn
 */
async function initiatePayment({
  bookingId,
  baseUrl,
  ipAddr,
  paymentMethod = DEFAULT_PAYMENT_METHOD,
  locale = "vi",
}) {
  // Object.hasOwn: tránh các key kế thừa như "constructor"/"__proto__" lọt qua
  // bước kiểm tra chỉ vì tồn tại trên prototype của object.
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
  // Chặn sớm ở tầng service, tránh tạo giao dịch gần như chắc chắn sẽ rơi vào
  // payment_error_manual_refund khi IPN về (xem ghi chú y) — dù cron job (ghi chú f)
  // có thể chưa kịp quét nhả ghế.
  const expiresAt = booking.payment?.payment_expires_at;
  if (expiresAt && nowVN().toDate() > expiresAt) {
    throw new PaymentError(
      "Đã quá hạn giữ ghế cho booking này, vui lòng đặt lại từ đầu.",
      409
    );
  }

  // Ghế phải CÒN được user này giữ — nếu không, khách trả tiền xong mới phát hiện mất ghế và phải hoàn
  // tay. Chặn trước khi tạo giao dịch.
  await assertBookingSeatsStillHeld(booking);

  // VNPay chỉ nhận số tiền trong khoảng giới hạn — ngoài khoảng này VNPay từ chối nhưng booking đã
  // tạo (ghế đang bị giữ) → kẹt đến khi hết hạn. Chặn sớm.
  if (booking.total_amount < PAYMENT_MIN_AMOUNT || booking.total_amount > PAYMENT_MAX_AMOUNT) {
    throw new PaymentError(
      `Tổng tiền ${booking.total_amount.toLocaleString("vi-VN")}đ nằm ngoài giới hạn thanh toán VNPay (${PAYMENT_MIN_AMOUNT.toLocaleString("vi-VN")}–${PAYMENT_MAX_AMOUNT.toLocaleString("vi-VN")}đ).`,
      400
    );
  }

  const orderId = buildOrderId(bookingId);
  // Return URL KHÔNG kèm query (?bookingId=...) — VNPay tự nối tham số vnp_* vào sau; trang kết quả
  // lấy bookingId từ vnp_TxnRef.
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

  // Ghi nhớ phương thức + mã đơn hàng vừa tạo (KHÔNG đụng status) — updateOne thay vì booking.save()
  // để không ghi đè nhầm các field khác nếu IPN của lần thanh toán trước đang xử lý song song. Điều
  // kiện status giữ cho booking đã chốt (confirmed/cancelled...) không bị sửa lại.
  // `last_order_id` + `last_order_date` dùng để syncPaymentStatus() hỏi lại VNPay (querydr bắt buộc
  // gửi đúng ngày tạo giao dịch).
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

/**
 * Ghế "thất bại" khi confirm có thể chỉ là do luồng song song (IPN + syncPaymentStatus) vừa
 * confirm xong CHÍNH booking này: ghế đã `booked` bởi chủ booking và không thuộc booking
 * confirmed nào khác -> coi như thành công, không phải mất ghế thật.
 */
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

/**
 * Ghi nhận thanh toán ĐÃ ĐƯỢC VNPAY XÁC NHẬN (IPN đúng chữ ký, hoặc kết quả querydr) cho booking
 * `pending_payment` — dùng chung cho IPN và syncPaymentStatus. Mọi thay đổi status đều là
 * findOneAndUpdate ATOMIC có điều kiện `status: "pending_payment"` nên 2 luồng chạy song song /
 * khách hủy cùng lúc không ghi đè nhau. KHÔNG throw vì lỗi nghiệp vụ: tiền đã bị trừ thật.
 *
 * @param {Object} booking
 * @param {{transId: String, amount: Number}} paid - số tiền VNĐ (đã chia 100)
 */
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

  // Số tiền VNPay thu khác tổng booking (không xảy ra với giao dịch do chính server tạo): không
  // confirm ghế, đánh dấu hoàn tay, nhả ghế đang giữ.
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

  // Ghi chú (y): mất ghế thật -> TUYỆT ĐỐI không 'confirmed'; không rollback ghế đã confirm vì
  // tiền đã trừ thật — admin hoàn tay (A3).
  const won = await claim(seatsLost ? "payment_error_manual_refund" : "confirmed");

  if (!won) {
    // Thua race ghi status. Luồng kia đã xác nhận -> trả về luôn. Nếu booking đã bị hủy trong lúc
    // chờ: nhả đúng những ghế VỪA confirm ở lần gọi này rồi ghi nhận thanh toán muộn.
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

/**
 * Nhánh THẤT BẠI (VNPay xác nhận thất bại dứt khoát). Giành quyền đổi status TRƯỚC (atomic, điều
 * kiện pending_payment), chỉ thắng mới nhả ghế -> không nhả nhầm khi luồng khác vừa xác nhận
 * thanh toán thành công.
 */
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

/**
 * Quyết định webhook cần làm gì — hàm THUẦN (không đụng DB) để test được.
 *
 * - `pending_payment` + thành công        -> "confirm"
 * - `pending_payment` + thất bại          -> "fail"
 * - `cancelled` + thành công + chưa ghi transaction_id -> "late_payment_error":
 *   booking đã bị cron/khách hủy (ghế đã nhả) nhưng VNPay vẫn trừ tiền. Theo ghi chú (y)
 *   KHÔNG được bỏ qua âm thầm — chuyển `payment_error_manual_refund` để admin hoàn tay.
 * - thành công lần nữa (transId khác) trên booking đã chốt -> "duplicate_payment"
 * - mọi trường hợp khác (IPN gửi lại, booking đã confirmed/refunded...) -> "noop"
 *
 * @param {{status: String, paid: Boolean, hasTransactionId?: Boolean, transId?: String, storedTransId?: String}} p
 */
function decideWebhookAction({ status, paid, hasTransactionId, transId, storedTransId }) {
  if (status === "pending_payment") {
    return paid ? "confirm" : "fail";
  }
  if (status === "cancelled" && paid && !hasTransactionId) {
    return "late_payment_error";
  }
  // Thanh toán THÀNH CÔNG thêm lần nữa trên 1 booking đã chốt (VD khách bấm "Thanh toán"
  // 2 lần -> 2 giao dịch VNPay, cả 2 đều trả tiền). IPN gửi lại cùng transId thì vẫn là noop.
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

/**
 * Ghi nhận khoản thanh toán thừa (trả 2 lần cho 1 booking) vào payment.extra_payments để
 * admin hoàn tay. Idempotent theo trans_id (IPN gửi lại không ghi trùng).
 */
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

/**
 * Tiền đã bị trừ nhưng booking đã `cancelled` (ghế đã được nhả từ trước, có thể đang
 * thuộc người khác) -> KHÔNG đụng tới ghế, chỉ ghi nhận giao dịch + đánh dấu cần hoàn tay.
 * Atomic (điều kiện cancelled + chưa có transaction_id).
 */
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

/**
 * Trang kết quả thanh toán (Return URL) gọi mỗi khi khách quay lại: booking còn `pending_payment`
 * thì server hỏi thẳng VNPay (querydr) kết quả giao dịch gần nhất — KHÔNG tin tham số trên Return
 * URL. Nhờ vậy chạy local không cần ngrok (IPN không về được) vẫn chốt được booking.
 *
 * - "success"  -> ghi nhận như IPN (số tiền lệch -> payment_error_manual_refund).
 * - "failed"   -> hủy booking + nhả ghế ngay (VNPay đã xác nhận thất bại dứt khoát).
 * - còn lại (chưa thanh toán / đang xử lý / không truy vấn được) -> giữ nguyên; IPN hoặc cron
 *   (quá payment_expires_at) sẽ dọn.
 * Không bao giờ ném lỗi ra ngoài: lỗi mạng/VNPay -> trả booking nguyên trạng.
 *
 * @param {String} bookingId
 * @returns {Promise<Object|null>} Booking doc (sau khi có thể đã được xác nhận)
 */
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

/**
 * C6 — xử lý IPN VNPay gửi tới `GET /api/payments/vnpay-ipn` (URL cấu hình ở trang quản trị merchant).
 *
 * Tin IPN sau khi xác minh: chữ ký HMAC-SHA512 bằng vnp_HashSecret RIÊNG của merchant + đúng
 * vnp_TmnCode + đúng số tiền. (Khác MoMo sandbox dùng chung khóa công khai, nên không cần hỏi lại
 * VNPay cho từng IPN.)
 *
 * IDEMPOTENT: VNPay có thể gửi lại cùng 1 IPN nhiều lần — booking đã ra khỏi `pending_payment`
 * thì coi như no-op, KHÔNG chạy lại confirmAllSeatsBooked.
 *
 * @param {Object} query - tham số vnp_* trên query string
 * @returns {Promise<{ booking: Object, rspCode: String }>} rspCode "00" đã xử lý, "02" đơn đã được
 *   xác nhận từ trước (IPN lặp lại)
 * @throws {PaymentError} rspCode 97 sai chữ ký, 01 không có đơn, 04 sai số tiền, 99 chưa xử lý được
 */
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

  // Số tiền trong IPN phải đúng tổng tiền booking (chữ ký đúng nhưng số tiền lệch = dữ liệu bất
  // thường) — trả "04" theo quy ước VNPay, không đổi gì.
  if (result.amount !== booking.total_amount) {
    console.error(`[webhook] SAI SỐ TIỀN: bookingId=${booking._id}, VNPay=${result.amount}, booking=${booking.total_amount}`);
    throw new PaymentError("Số tiền không khớp booking.", 400, "04");
  }

  // Lọc IPN thất bại lỗi thời: mã đơn hàng không khớp lần thanh toán cuối (payment.last_order_id)
  // -> phản hồi của lần CŨ hơn, KHÔNG được hủy booking khi lần mới có thể đang chờ.
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
