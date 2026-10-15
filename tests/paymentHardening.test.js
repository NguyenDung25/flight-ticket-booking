// Vá thanh toán/giữ ghế: IPN VNPay atomic + idempotent, trang kết quả hỏi lại VNPay (querydr),
// IPN trùng/muộn, không gia hạn giữ ghế vô hạn, đệm 5 phút. Không cần MongoDB (stub tại chỗ).

process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/test";
process.env.VNPAY_TMN_CODE = "TESTTMN1";
process.env.VNPAY_HASH_SECRET = "test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const Flight = require("../models/Flight");
const vnpayClient = require("../lib/vnpayClient");
const seatService = require("../services/seatService");
const ticketService = require("../services/ticketService");
const paymentService = require("../services/paymentService");
const { assertSeatIsHeldByUser } = require("../services/bookingValidationService");

const OID = (n) => String(n).padStart(24, "0");
const TXN = `${OID(100)}1760000000000`;
const patch = (obj, props) => {
  const saved = {};
  for (const k of Object.keys(props)) { saved[k] = obj[k]; obj[k] = props[k]; }
  return () => Object.assign(obj, saved);
};
const pending = (o = {}) => ({
  _id: OID(100), user_id: OID(7), status: "pending_payment", total_amount: 2_000_000,
  payment: { last_order_id: TXN, last_order_date: "20261015100000" },
  passengers: [{ seats: [{ flight_id: OID(1), seat_number: "1A" }] }], ...o,
});

function stubs({ booking, queryResult, seatResult, queryThrows, existsOther = null, bookedBySame = true, atomicWin = true, sigOk = true }) {
  const w = { updates: [], released: [], issued: 0, queried: 0 };
  const restores = [
    patch(Booking, {
      findById: async () => booking,
      findOneAndUpdate: async (filter, update) => {
        w.updates.push({ filter, update });
        return atomicWin ? { ...booking, ...update.$set, _id: booking._id, passengers: booking.passengers } : null;
      },
      updateOne: async (filter, update) => { w.updates.push({ filter, update }); return {}; },
      exists: async () => existsOther,
    }),
    patch(vnpayClient, {
      verifyReturnParams: () => sigOk,
      queryTransaction: async () => { w.queried += 1; if (queryThrows) throw new Error("net"); return queryResult; },
    }),
    patch(seatService, {
      confirmAllSeatsBooked: async () => seatResult,
      isSeatBookedBy: async () => bookedBySame,
      forceReleaseSeat: async (a) => { w.released.push(a); return true; },
    }),
    patch(ticketService, { issueTicket: async () => { w.issued += 1; return {}; } }),
  ];
  return { w, restore: () => restores.forEach((r) => r()) };
}
const okSeats = { allSucceeded: true, failedSeats: [] };
const lostSeat = { allSucceeded: false, failedSeats: [{ flightId: OID(1), seatNumber: "1A" }] };
const paidResult = (o = {}) => ({ status: "success", amount: 2_000_000, transId: "14000007", txnRef: TXN, ...o });

// ---------- syncPaymentStatus (trang kết quả hỏi lại VNPay) ----------
test("sync: VNPay thu lệch tiền -> payment_error_manual_refund + nhả ghế, không xuất vé", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, queryResult: paidResult({ amount: 1000 }), seatResult: okSeats });
  try {
    await paymentService.syncPaymentStatus(String(b._id));
    assert.equal(w.updates[0].filter.status, "pending_payment");
    assert.equal(w.updates[0].update.$set.status, "payment_error_manual_refund");
    assert.equal(w.released.length, 1);
    assert.equal(w.issued, 0);
  } finally { restore(); }
});

test("sync: chưa thanh toán / đang xử lý / trạng thái lạ / lỗi mạng -> không đổi gì", async () => {
  for (const status of ["not_found", "pending", "other"]) {
    const b = pending();
    const { w, restore } = stubs({ booking: b, queryResult: { status }, seatResult: okSeats });
    try { await paymentService.syncPaymentStatus(String(b._id)); assert.equal(w.updates.length, 0); } finally { restore(); }
  }
  const b = pending();
  const { w, restore } = stubs({ booking: b, queryThrows: true, seatResult: okSeats });
  try { await paymentService.syncPaymentStatus(String(b._id)); assert.equal(w.updates.length, 0); } finally { restore(); }
});

test("sync: VNPay xác nhận thất bại -> hủy atomic rồi mới nhả ghế", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, queryResult: { status: "failed", txnRef: TXN }, seatResult: okSeats });
  try {
    await paymentService.syncPaymentStatus(String(b._id));
    assert.equal(w.updates[0].filter.status, "pending_payment");
    assert.equal(w.updates[0].update.$set.status, "cancelled");
    assert.equal(w.released.length, 1);
  } finally { restore(); }
});

test("sync: booking chưa có last_order_date (chưa tạo giao dịch) -> không truy vấn", async () => {
  const b = pending({ payment: { last_order_id: TXN } });
  const { w, restore } = stubs({ booking: b, queryResult: paidResult(), seatResult: okSeats });
  try { await paymentService.syncPaymentStatus(String(b._id)); assert.equal(w.queried, 0); } finally { restore(); }
});

test("race IPN+sync: ghế đã booked bởi chính chủ -> vẫn confirmed, xuất vé", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, queryResult: paidResult(), seatResult: lostSeat });
  try {
    await paymentService.syncPaymentStatus(String(b._id));
    assert.equal(w.updates[0].update.$set.status, "confirmed");
    assert.equal(w.updates[0].update.$set["payment.transaction_id"], "14000007");
    assert.equal(w.issued, 1);
  } finally { restore(); }
});

test("ghế booked nhưng thuộc booking khác -> payment_error_manual_refund", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, queryResult: paidResult(), seatResult: lostSeat, existsOther: { _id: OID(9) } });
  try {
    await paymentService.syncPaymentStatus(String(b._id));
    assert.equal(w.updates[0].update.$set.status, "payment_error_manual_refund");
    assert.equal(w.issued, 0);
  } finally { restore(); }
});

test("ghế không còn booked bởi chủ (cron nhả) -> payment_error_manual_refund", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, queryResult: paidResult(), seatResult: lostSeat, bookedBySame: false });
  try {
    await paymentService.syncPaymentStatus(String(b._id));
    assert.equal(w.updates[0].update.$set.status, "payment_error_manual_refund");
  } finally { restore(); }
});

test("thua race ghi status -> không xuất vé", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, queryResult: paidResult(), seatResult: okSeats, atomicWin: false });
  try { await paymentService.syncPaymentStatus(String(b._id)); assert.equal(w.issued, 0); } finally { restore(); }
});

// ---------- IPN (GET /api/payments/vnpay-ipn) ----------
const ipn = (o = {}) => ({
  vnp_TxnRef: TXN, vnp_Amount: "200000000", vnp_ResponseCode: "00", vnp_TransactionStatus: "00",
  vnp_TransactionNo: "14000055", vnp_TmnCode: "TESTTMN1", vnp_SecureHash: "x", ...o,
});
const failedIpn = (o = {}) => ipn({ vnp_ResponseCode: "24", vnp_TransactionStatus: "02", vnp_TransactionNo: "0", ...o });

test("IPN thành công đúng chữ ký + đúng tiền -> confirmed, xuất vé, RspCode 00, KHÔNG cần truy vấn lại", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, seatResult: okSeats });
  try {
    const { rspCode } = await paymentService.handleWebhook(ipn());
    assert.equal(rspCode, "00");
    assert.equal(w.updates[0].update.$set.status, "confirmed");
    assert.equal(w.updates[0].update.$set["payment.transaction_id"], "14000055");
    assert.equal(w.issued, 1);
    assert.equal(w.queried, 0);
  } finally { restore(); }
});

test("IPN sai chữ ký -> RspCode 97, không đụng DB", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, seatResult: okSeats, sigOk: false });
  try {
    await assert.rejects(() => paymentService.handleWebhook(ipn()), { rspCode: "97" });
    assert.equal(w.updates.length, 0);
  } finally { restore(); }
});

test("IPN mã đơn hàng lạ / không có booking -> RspCode 01", async () => {
  let s = stubs({ booking: pending(), seatResult: okSeats });
  try { await assert.rejects(() => paymentService.handleWebhook(ipn({ vnp_TxnRef: "abc" })), { rspCode: "01" }); } finally { s.restore(); }
  s = stubs({ booking: null, seatResult: okSeats });
  try { await assert.rejects(() => paymentService.handleWebhook(ipn()), { rspCode: "01" }); } finally { s.restore(); }
});

test("IPN số tiền không khớp booking -> RspCode 04, không đổi booking", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, seatResult: okSeats });
  try {
    await assert.rejects(() => paymentService.handleWebhook(ipn({ vnp_Amount: "100000" })), { rspCode: "04" });
    assert.equal(w.updates.length, 0);
  } finally { restore(); }
});

test("IPN giao dịch còn đang xử lý -> RspCode 99 (để VNPay gửi lại), không đổi booking", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, seatResult: okSeats });
  try {
    await assert.rejects(() => paymentService.handleWebhook(ipn({ vnp_TransactionStatus: "01" })), { rspCode: "99", statusCode: 503 });
    assert.equal(w.updates.length, 0);
  } finally { restore(); }
});

test("IPN thất bại -> hủy atomic rồi mới nhả ghế", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, seatResult: okSeats });
  try {
    const { rspCode } = await paymentService.handleWebhook(failedIpn());
    assert.equal(rspCode, "00");
    assert.equal(w.updates[0].filter.status, "pending_payment");
    assert.equal(w.updates[0].update.$set.status, "cancelled");
    assert.equal(w.released.length, 1);
  } finally { restore(); }
});

test("IPN thất bại: thua race (đã xử lý) -> KHÔNG nhả ghế", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, seatResult: okSeats, atomicWin: false });
  try {
    await paymentService.handleWebhook(failedIpn());
    assert.equal(w.released.length, 0);
  } finally { restore(); }
});

test("IPN thất bại của lần thanh toán CŨ (không phải last_order_id) -> bỏ qua, không hủy", async () => {
  const b = pending();
  const { w, restore } = stubs({ booking: b, seatResult: okSeats });
  try {
    const { rspCode } = await paymentService.handleWebhook(failedIpn({ vnp_TxnRef: `${OID(100)}1700000000000` }));
    assert.equal(rspCode, "00");
    assert.equal(w.updates.length, 0);
  } finally { restore(); }
});

test("IPN trùng / muộn / gửi lại", async () => {
  // thành công lần 2 (transId khác) trên booking confirmed -> ghi extra_payments
  let b = pending({ status: "confirmed", payment: { transaction_id: "1", last_order_id: TXN } });
  let s = stubs({ booking: b, seatResult: okSeats });
  try {
    await paymentService.handleWebhook(ipn());
    assert.equal(s.w.updates.length, 1);
    assert.equal(s.w.updates[0].update.$push["payment.extra_payments"].trans_id, "14000055");
  } finally { s.restore(); }
  // IPN gửi lại cùng transId -> noop, RspCode 02
  b = pending({ status: "confirmed", payment: { transaction_id: "14000055", last_order_id: TXN } });
  s = stubs({ booking: b, seatResult: okSeats });
  try {
    const { rspCode } = await paymentService.handleWebhook(ipn());
    assert.equal(rspCode, "02");
    assert.equal(s.w.updates.length, 0);
  } finally { s.restore(); }
  // late payment trên booking cancelled -> payment_error_manual_refund, không đụng ghế
  b = pending({ status: "cancelled" });
  s = stubs({ booking: b, seatResult: okSeats });
  try {
    await paymentService.handleWebhook(ipn());
    assert.equal(s.w.updates[0].filter.status, "cancelled");
    assert.equal(s.w.updates[0].update.$set.status, "payment_error_manual_refund");
    assert.equal(s.w.released.length, 0);
  } finally { s.restore(); }
});

test("holdSeat: ghế mình đang giữ còn hạn KHÔNG bị gia hạn (idempotent)", async () => {
  const mine = { _id: "f1" };
  let sets = 0;
  const restore = patch(Flight, {
    aggregate: async () => [],
    findOneAndUpdate: async () => { sets += 1; return null; },
    findOne: async () => mine,
  });
  try {
    const res = await seatService.holdSeat({ flightId: "f1", seatNumber: "1A", userId: OID(7) });
    assert.equal(res, mine);
    assert.equal(sets, 1); // chỉ thử chiếm ghế trống/hết hạn, không có nhánh gia hạn
  } finally { restore(); }
});

test("assertSeatIsHeldByUser: cần còn > 5 phút giữ ghế; held_until thiếu bị từ chối", () => {
  const now = new Date();
  const seat = (ms) => ({ seats: [{ seat_number: "1A", status: "held", held_by: "u", held_until: ms === null ? undefined : new Date(now.getTime() + ms) }] });
  assert.doesNotThrow(() => assertSeatIsHeldByUser(seat(10 * 60_000), "1A", "u", now));
  assert.throws(() => assertSeatIsHeldByUser(seat(4 * 60_000), "1A", "u", now), { statusCode: 409 });
  assert.throws(() => assertSeatIsHeldByUser(seat(null), "1A", "u", now), { statusCode: 409 });
  assert.throws(() => assertSeatIsHeldByUser(seat(10 * 60_000), "1A", "other", now), { statusCode: 409 });
});
