process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const Booking = require("../models/Booking");
const seatService = require("../services/seatService");
const ticketService = require("../services/ticketService");
const vnpayClient = require("../lib/vnpayClient");
const payment = require("../services/paymentService");
const cancellation = require("../services/cancellationService");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const setDeep = (o, path, v) => {
  const ks = path.split(".");
  ks.slice(0, -1).reduce((x, k) => (x[k] ??= {}), o)[ks.at(-1)] = v;
};
function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = get(doc, k);
    if (cond && typeof cond === "object" && "$ne" in cond) return (v ?? null) !== cond.$ne;
    if (cond && typeof cond === "object" && "$lt" in cond) return v < cond.$lt;
    if (cond === null) return v == null;
    return String(v) === String(cond);
  });
}

const BID = "000000000000000000000100";
function setup(initial) {
  const doc = {
    _id: BID,
    user_id: "u1",
    status: "pending_payment",
    total_amount: 1_000_000,
    payment: { last_order_id: `${BID}1`, last_order_date: "20261015100000", transaction_id: null },
    passengers: [{ seats: [{ flight_id: "f1", seat_number: "1A" }] }],
    ...initial,
  };
  const orig = {
    updateOne: Booking.updateOne,
    findOneAndUpdate: Booking.findOneAndUpdate,
    findById: Booking.findById,
    find: Booking.find,
    exists: Booking.exists,
    bookedBy: seatService.isSeatBookedBy,
    confirm: seatService.confirmAllSeatsBooked,
    release: seatService.forceReleaseSeat,
    issue: ticketService.issueTicket,
    verify: vnpayClient.verifyReturnParams,
    query: vnpayClient.queryTransaction,
  };
  const calls = { issue: 0, released: 0, confirm: 0 };
  const state = { bookedBySame: true };
  const snapshot = () => structuredClone(doc);
  Booking.findById = async () => ({ ...snapshot(), save: async () => {} });
  Booking.updateOne = async (filter, update) => {
    if (!matches(doc, filter)) return { modifiedCount: 0 };
    for (const [k, v] of Object.entries(update.$set ?? {})) setDeep(doc, k, v);
    return { modifiedCount: 1 };
  };
  Booking.findOneAndUpdate = async (filter, update) => {
    if (!matches(doc, filter)) return null;
    for (const [k, v] of Object.entries(update.$set ?? {})) setDeep(doc, k, v);
    return snapshot();
  };
  Booking.find = async () => [snapshot()];
  Booking.exists = async () => null; // không có booking khác giữ ghế
  seatService.isSeatBookedBy = async () => state.bookedBySame;
  seatService.confirmAllSeatsBooked = async () => {
    calls.confirm += 1;
    await sleep(20); // cửa sổ race: ghế đang được đặt thì bên kia chen vào
    // Mô phỏng MongoDB: ghế chỉ chuyển held→booked được 1 lần; lần 2 thất bại.
    return calls.confirm === 1 ? { allSucceeded: true, failedSeats: [] } : { allSucceeded: false, failedSeats: [{}] };
  };
  seatService.forceReleaseSeat = async () => { calls.released += 1; return true; };
  ticketService.issueTicket = async () => { calls.issue += 1; };
  vnpayClient.verifyReturnParams = () => true;
  vnpayClient.queryTransaction = async () => ({ status: "success", amount: 1_000_000, transId: "777", txnRef: `${BID}1` });
  const restore = () => {
    Booking.updateOne = orig.updateOne; Booking.findOneAndUpdate = orig.findOneAndUpdate;
    Booking.findById = orig.findById; Booking.find = orig.find; Booking.exists = orig.exists;
    seatService.isSeatBookedBy = orig.bookedBy;
    seatService.confirmAllSeatsBooked = orig.confirm; seatService.forceReleaseSeat = orig.release;
    ticketService.issueTicket = orig.issue; vnpayClient.verifyReturnParams = orig.verify;
    vnpayClient.queryTransaction = orig.query;
  };
  return { doc, calls, state, restore };
}

const ipn = {
  vnp_TxnRef: `${BID}1`, vnp_Amount: "100000000", vnp_ResponseCode: "00", vnp_TransactionStatus: "00",
  vnp_TransactionNo: "777", vnp_TmnCode: "TESTTMN1", vnp_SecureHash: "x",
};

test("race: IPN và syncPaymentStatus chạy song song → đúng 1 vé, trạng thái confirmed (không bị ghi đè)", async () => {
  const { doc, calls, restore } = setup();
  try {
    await Promise.all([payment.handleWebhook(structuredClone(ipn)), payment.syncPaymentStatus(BID)]);
    assert.equal(doc.status, "confirmed");
    assert.equal(doc.payment.transaction_id, "777");
    assert.equal(calls.issue, 1, "vé chỉ được phát hành 1 lần");
  } finally { restore(); }
});

test("race: 3 luồng đồng bộ/IPN trùng lặp song song → vẫn 1 vé, confirmed", async () => {
  const { doc, calls, restore } = setup();
  try {
    await Promise.all([
      payment.syncPaymentStatus(BID),
      payment.syncPaymentStatus(BID),
      payment.handleWebhook(structuredClone(ipn)),
    ]);
    assert.equal(doc.status, "confirmed");
    assert.equal(calls.issue, 1);
  } finally { restore(); }
});

test("mất ghế THẬT khi VNPay báo thành công (ghế không còn booked bởi chủ) → manual_refund, không phát vé", async () => {
  const { doc, calls, state, restore } = setup();
  try {
    state.bookedBySame = false;
    seatService.confirmAllSeatsBooked = async () => ({ allSucceeded: false, failedSeats: [{ flightId: "f1", seatNumber: "1A" }] });
    await payment.syncPaymentStatus(BID);
    assert.equal(doc.status, "payment_error_manual_refund");
    assert.equal(doc.payment.transaction_id, "777");
    assert.equal(calls.issue, 0);
  } finally { restore(); }
});

test("cron: booking quá hạn nhưng ĐÃ có giao dịch VNPay → chuyển xử lý tay, không hủy, không nhả ghế", async () => {
  const { doc, calls, restore } = setup({ payment: { transaction_id: "777", payment_expires_at: new Date(0) } });
  try {
    const n = await cancellation.cancelExpiredPendingPayments();
    assert.equal(n, 0);
    assert.equal(doc.status, "payment_error_manual_refund");
    assert.equal(calls.released, 0);
  } finally { restore(); }
});

test("cron: booking quá hạn CHƯA trả tiền → hủy và nhả ghế như cũ", async () => {
  const { doc, calls, restore } = setup({ payment: { transaction_id: null, payment_expires_at: new Date(0) } });
  try {
    const n = await cancellation.cancelExpiredPendingPayments();
    assert.equal(n, 1);
    assert.equal(doc.status, "cancelled");
    assert.ok(calls.released >= 1);
  } finally { restore(); }
});
