process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const { decideWebhookAction } = require("../services/paymentService");
const { planCancellation, computeBulkRefund, CancellationError } = require("../services/cancellationService");
const { validateRoundTripRoute, assertSeatIsHeldByUser } = require("../services/bookingValidationService");
const { assertValidSeatNumber } = require("../services/seatService");
const throttle = require("../lib/loginThrottle");
const { registerUser } = require("../services/authService");

const H = 3600 * 1000;
const now = new Date("2026-11-01T00:00:00Z");
const at = (hours) => new Date(now.getTime() + hours * H);

// ---------- #2 thanh toán trùng ----------
test("#2 thanh toán thành công lần 2 (transId khác) trên booking đã confirmed → duplicate_payment", () => {
  assert.equal(
    decideWebhookAction({ status: "confirmed", paid: true, hasTransactionId: true, transId: 222, storedTransId: 111 }),
    "duplicate_payment"
  );
});
test("#2 IPN gửi lại cùng transId vẫn là noop (idempotent)", () => {
  assert.equal(
    decideWebhookAction({ status: "confirmed", paid: true, hasTransactionId: true, transId: 111, storedTransId: 111 }),
    "noop"
  );
});
test("#2 luồng cũ không đổi: pending→confirm/fail, cancelled chưa có tiền→late_payment_error", () => {
  assert.equal(decideWebhookAction({ status: "pending_payment", paid: true }), "confirm");
  assert.equal(decideWebhookAction({ status: "pending_payment", paid: false }), "fail");
  assert.equal(
    decideWebhookAction({ status: "cancelled", paid: true, hasTransactionId: false, transId: 5 }),
    "late_payment_error"
  );
});

// ---------- #3 hủy chuyến bay (A8) ----------
const rt = {
  total_amount: 3_000_000,
  flights: [
    { flight_id: "OUT", leg: "outbound", amount: 1_000_000 },
    { flight_id: "RET", leg: "return", amount: 2_000_000 },
  ],
};
test("#3 chuyến bị hủy đã QUA giờ khởi hành vẫn được hoàn đủ (không coi là đã bay)", () => {
  const flightMap = { OUT: { departure_time: at(-48) }, RET: { departure_time: at(-1) } };
  const r = computeBulkRefund({ booking: rt, flightMap, cancelledFlightId: "RET", now });
  // Chặng đi đã bay thật (1tr) bị trừ; chặng về là chuyến bị hủy → hoàn đủ 2tr
  assert.equal(r.refundAmount, 2_000_000);
  assert.equal(r.tier, "partial");
});
test("#3 hủy chuyến chưa bay: hoàn 100%", () => {
  const flightMap = { OUT: { departure_time: at(10) }, RET: { departure_time: at(100) } };
  const r = computeBulkRefund({ booking: rt, flightMap, cancelledFlightId: "OUT", now });
  assert.equal(r.refundAmount, 3_000_000);
  assert.equal(r.tier, "full");
  assert.equal(r.feeAmount, 0);
});

// ---------- #9 planCancellation (logic hủy do khách) ----------
const one = (amount = 1_000_000, pax = 1) => ({
  trip_type: "one_way",
  passengers: Array.from({ length: pax }, () => ({})),
  total_amount: amount,
  flights: [{ flight_id: "F", leg: "outbound", amount }],
});
test("#9 một chiều (khách phổ thông): ≥24h phí 300k; 3–24h phí 600k; <3h và đã bay hoàn 0 (ghi chú j)", () => {
  assert.equal(planCancellation({ booking: one(), flightMap: { F: { departure_time: at(48) } }, now }).refund, 700_000);
  const mid = planCancellation({ booking: one(), flightMap: { F: { departure_time: at(10) } }, now });
  assert.equal(mid.tier, "fixed_fee");
  assert.equal(mid.fee, 600_000);
  assert.equal(mid.refund + mid.fee, 1_000_000);
  assert.equal(planCancellation({ booking: one(), flightMap: { F: { departure_time: at(1) } }, now }).refund, 0);
  assert.equal(planCancellation({ booking: one(), flightMap: { F: { departure_time: at(-5) } }, now }).refund, 0);
});
test("#9 khứ hồi TH1/TH2/TH3 theo ghi chú w", () => {
  const b = { ...rt, trip_type: "round_trip", passengers: [{}] };
  const th1 = planCancellation({ booking: b, flightMap: { OUT: { departure_time: at(48) }, RET: { departure_time: at(96) } }, now });
  assert.equal(th1.releaseFlightIds, null);
  assert.equal(th1.refund, 2_700_000); // phổ thông, ≥24h: phí 300k trên toàn booking

  const th2 = planCancellation({ booking: b, flightMap: { OUT: { departure_time: at(-5) }, RET: { departure_time: at(48) } }, now });
  assert.equal(th2.tier, "partial");
  assert.deepEqual(th2.releaseFlightIds, ["RET"]);
  assert.equal(th2.refund, 1_700_000); // chỉ tính trên chặng về (2tr − 300k)

  assert.throws(
    () => planCancellation({ booking: b, flightMap: { OUT: { departure_time: at(-50) }, RET: { departure_time: at(-5) } }, now }),
    (e) => e instanceof CancellationError && e.statusCode === 409
  );
});

// ---------- #4/#5 ghế & booking ----------
test("#5 ghế held đã quá hạn không còn hợp lệ khi tạo booking", () => {
  const flight = (heldUntil) => ({ seats: [{ seat_number: "1A", status: "held", held_by: "u1", held_until: heldUntil }] });
  assert.doesNotThrow(() => assertSeatIsHeldByUser(flight(new Date(Date.now() + H)), "1A", "u1"));
  assert.throws(() => assertSeatIsHeldByUser(flight(new Date(Date.now() - 1000)), "1A", "u1"), { statusCode: 409 });
});

// ---------- #7 seat_number ----------
test("#7 seat_number phải là chuỗi ngắn — chặn object toán tử NoSQL", () => {
  assert.doesNotThrow(() => assertValidSeatNumber("12A"));
  for (const bad of [{ $ne: "" }, { $gt: "" }, ["1A"], 12, "", "1A; DROP", "TOOLONG1234"]) {
    assert.throws(() => assertValidSeatNumber(bad), { statusCode: 400 });
  }
});

// ---------- #8 khứ hồi đúng chiều ----------
test("#8 chặng về phải là chiều ngược của chặng đi", () => {
  const out = { origin_code: "HAN", dest_code: "SGN" };
  assert.doesNotThrow(() => validateRoundTripRoute(out, { origin_code: "SGN", dest_code: "HAN" }));
  assert.throws(() => validateRoundTripRoute(out, { origin_code: "DAD", dest_code: "PQC" }), { statusCode: 400 });
  assert.throws(() => validateRoundTripRoute(out, { origin_code: "HAN", dest_code: "SGN" }), { statusCode: 400 });
});

// ---------- #10 đăng nhập / đăng ký ----------
test("#10 khóa tạm sau 5 lần sai, tự mở sau thời gian khóa, reset khi thành công", () => {
  const k = "a@b.c";
  throttle.reset(k);
  for (let i = 0; i < throttle.MAX_FAILURES - 1; i++) throttle.recordFailure(k, 1000);
  assert.equal(throttle.lockRemainingMs(k, 1000), 0);
  throttle.recordFailure(k, 1000);
  assert.ok(throttle.lockRemainingMs(k, 2000) > 0);
  assert.equal(throttle.lockRemainingMs(k, 1000 + throttle.LOCK_MS + 1), 0);
  throttle.recordFailure(k, 5);
  throttle.reset(k);
  assert.equal(throttle.lockRemainingMs(k, 6), 0);
});
test("#10 đăng ký: sai kiểu / quá dài / ngôn ngữ lạ → 400 (không còn 500)", async () => {
  const ok = { email: "a@b.com", password: "123456", full_name: "An" };
  for (const bad of [
    { ...ok, email: { $ne: 1 } },
    { ...ok, password: ["123456"] },
    { ...ok, full_name: { a: 1 } },
    { ...ok, full_name: "x".repeat(101) },
    { ...ok, password: "é".repeat(40) }, // 80 byte > 72
    { ...ok, preferred_language: "fr" },
  ]) {
    await assert.rejects(() => registerUser(bad), { statusCode: 400 });
  }
});
