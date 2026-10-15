// Dòng giải thích số tiền hoàn trên "Vé của tôi" — đủ các trường hợp hủy (một chiều, khứ hồi chặng
// đi/chặng về, hãng hủy) × các mốc 24h / 3h theo cancellationService.
const test = require("node:test");
const assert = require("node:assert/strict");
const { getRefundNote } = require("../lib/refundNote");

const DEP_OUT = "2026-10-12T06:29:00.000Z";
const DEP_RET = "2026-10-13T08:00:00.000Z";
const flight = (dep, extra = {}) => ({ departure_time: dep, status: "scheduled", ...extra });

const oneWay = (o) => ({ status: "refunded", trip_type: "one_way", total_amount: 3000000, refund_amount: 0,
  flights: [{ leg: "outbound", amount: 3000000, flight_id: flight(DEP_OUT) }], ...o });
const roundTrip = (o) => ({ status: "refunded", trip_type: "round_trip", total_amount: 14000000, refund_amount: 0,
  refund_processed_at: "2026-10-11T00:00:00.000Z", // trước giờ bay chặng đi -> TH1
  flights: [
    { leg: "outbound", amount: 6000000, flight_id: flight(DEP_OUT) },
    { leg: "return", amount: 8000000, flight_id: flight(DEP_RET) },
  ], ...o });
const afterOutbound = { refund_processed_at: "2026-10-12T07:00:00.000Z" }; // chặng đi đã bay -> TH2

test("chưa hoàn tiền / chưa có refund_amount -> không có ghi chú", () => {
  assert.equal(getRefundNote(oneWay({ status: "confirmed" })), null);
  assert.equal(getRefundNote(oneWay({ refund_amount: null })), null);
  assert.equal(getRefundNote(null), null);
});

test("một chiều: ≥24h hoàn đủ, 3–24h phí cố định, <3h không hoàn", () => {
  assert.deepEqual(getRefundNote(oneWay({ refund_amount: 3000000, cancellation_fee_amount: 0, cancellation_tier: "full" })),
    { key: "refundNoteOneWayFull", fee: null });
  assert.deepEqual(getRefundNote(oneWay({ refund_amount: 2600000, cancellation_fee_amount: 400000, cancellation_tier: "fixed_fee" })),
    { key: "refundNoteOneWayFixedFee", fee: 400000 });
  assert.deepEqual(getRefundNote(oneWay({ refund_amount: 0, cancellation_fee_amount: 3000000, cancellation_tier: "none" })),
    { key: "refundNoteOneWayNone", fee: null });
});

test("khứ hồi TH1 (chưa chặng nào bay): ghi chú theo mốc chặng ĐI", () => {
  assert.deepEqual(getRefundNote(roundTrip({ refund_amount: 14000000, cancellation_fee_amount: 0, cancellation_tier: "full" })),
    { key: "refundNoteOutboundFull", fee: null });
  assert.deepEqual(getRefundNote(roundTrip({ refund_amount: 13200000, cancellation_fee_amount: 800000, cancellation_tier: "fixed_fee" })),
    { key: "refundNoteOutboundFixedFee", fee: 800000 });
  assert.deepEqual(getRefundNote(roundTrip({ refund_amount: 0, cancellation_fee_amount: 14000000, cancellation_tier: "none" })),
    { key: "refundNoteOutboundNone", fee: null });
});

test("khứ hồi TH2 (chặng đi đã bay): tier luôn partial, ghi chú theo mốc chặng VỀ — ca thật AYZWL3 (hoàn 8tr/14tr, phí 0)", () => {
  assert.deepEqual(getRefundNote(roundTrip({ ...afterOutbound, refund_amount: 8000000, cancellation_fee_amount: 0, cancellation_tier: "partial" })),
    { key: "refundNoteReturnFull", fee: null });
  assert.deepEqual(getRefundNote(roundTrip({ ...afterOutbound, refund_amount: 7200000, cancellation_fee_amount: 800000, cancellation_tier: "partial" })),
    { key: "refundNoteReturnFixedFee", fee: 800000 });
  assert.deepEqual(getRefundNote(roundTrip({ ...afterOutbound, refund_amount: 0, cancellation_fee_amount: 8000000, cancellation_tier: "partial" })),
    { key: "refundNoteReturnNone", fee: null });
});

test("khứ hồi thiếu thông tin chuyến (flight_id chỉ là chuỗi): suy ra TH1/TH2 từ tier", () => {
  const stripped = (o) => roundTrip({ ...o, flights: [
    { leg: "outbound", amount: 6000000, flight_id: "6acc5b3758299fb40479fb40" },
    { leg: "return", amount: 8000000, flight_id: "6acc5b34c7bd99dd9c113ae7" },
  ] });
  assert.equal(getRefundNote(stripped({ refund_amount: 8000000, cancellation_fee_amount: 0, cancellation_tier: "partial" })).key, "refundNoteReturnFull");
  assert.equal(getRefundNote(stripped({ refund_amount: 14000000, cancellation_fee_amount: 0, cancellation_tier: "full" })).key, "refundNoteOutboundFull");
});

test("hãng hủy chuyến (A8): hoàn đủ không phí; khứ hồi đã bay 1 chặng thì trừ chặng đã bay", () => {
  const cancelled = (o) => roundTrip({ flights: [
    { leg: "outbound", amount: 6000000, flight_id: flight(DEP_OUT) },
    { leg: "return", amount: 8000000, flight_id: flight(DEP_RET, { status: "cancelled" }) },
  ], ...o });
  assert.deepEqual(getRefundNote(cancelled({ refund_amount: 14000000, cancellation_fee_amount: 0, cancellation_tier: "full" })),
    { key: "refundNoteAirlineFull", fee: null });
  assert.deepEqual(getRefundNote(cancelled({ refund_amount: 8000000, cancellation_fee_amount: 6000000, cancellation_tier: "partial" })),
    { key: "refundNoteAirlinePartial", fee: 6000000 });
});

test("mọi khóa trả về đều có trong messages en và vi", () => {
  const en = require("../messages/en.json").MyBookings;
  const vi = require("../messages/vi.json").MyBookings;
  const keys = ["OneWay", "Outbound"].flatMap((p) => ["Full", "FixedFee", "None"].map((s) => `refundNote${p}${s}`))
    .concat(["refundNoteReturnFull", "refundNoteReturnFixedFee", "refundNoteReturnNone", "refundNoteAirlineFull", "refundNoteAirlinePartial"]);
  for (const k of keys) {
    assert.ok(en[k], `thiếu en.${k}`);
    assert.ok(vi[k], `thiếu vi.${k}`);
  }
  // câu cần {fee} thì cả 2 ngôn ngữ đều phải có {fee}
  for (const k of keys.filter((x) => /FixedFee|AirlinePartial/.test(x))) {
    assert.ok(en[k].includes("{fee}") && vi[k].includes("{fee}"), `${k} thiếu {fee}`);
  }
});
