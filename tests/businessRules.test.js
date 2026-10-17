const test = require("node:test");
const assert = require("node:assert/strict");

const { computeCancellationFee, passengerShares, computeManualRefund } = require("../services/cancellationService");
const {
  validatePassengerDocument,
  validateNoDuplicateDocumentIds,
  validateRoundTripTransit,
} = require("../services/bookingValidationService");
const { decideWebhookAction } = require("../services/paymentService");
const { isCheckInWindowOpen, hoursUntil, ageInYears } = require("../lib/timezone");

const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------- A7: phí hủy theo mốc + hạng ghế
const eco = (share) => ({ seatClass: "economy", share });
const biz = (share) => ({ seatClass: "business", share });

test("computeCancellationFee: >=24h — phổ thông phí 300.000đ, thương gia miễn phí", () => {
  assert.deepEqual(computeCancellationFee(48, [eco(1_000_000)]), { tier: "fixed_fee", fee: 300_000, refund: 700_000, window: "early" });
  assert.deepEqual(computeCancellationFee(48, [biz(3_000_000)]), { tier: "full", fee: 0, refund: 3_000_000, window: "early" });
  assert.equal(computeCancellationFee(24, [eco(1_000_000)]).window, "early"); // đúng mốc 24h
});

test("computeCancellationFee: 3h–24h — phổ thông 600.000đ, thương gia 300.000đ mỗi khách", () => {
  assert.deepEqual(computeCancellationFee(4, [eco(1_000_000), biz(3_000_000)]), {
    tier: "fixed_fee",
    fee: 900_000,
    refund: 3_100_000,
    window: "mid",
  });
  assert.equal(computeCancellationFee(3, [eco(1_000_000)]).window, "mid"); // đúng mốc 3h
  assert.equal(computeCancellationFee(23.99, [eco(1_000_000)]).window, "mid");
});

test("computeCancellationFee: <3h hoặc đã qua giờ bay — phổ thông mất hết, thương gia phí bỏ chỗ 650.000đ", () => {
  assert.deepEqual(computeCancellationFee(2.99, [eco(1_000_000)]), { tier: "none", fee: 1_000_000, refund: 0, window: "late" });
  assert.deepEqual(computeCancellationFee(-5, [biz(3_000_000)]), { tier: "fixed_fee", fee: 650_000, refund: 2_350_000, window: "late" });
  // Booking hỗn hợp: khách phổ thông mất hết phần của mình, khách thương gia vẫn được hoàn phần còn lại.
  const mixed = computeCancellationFee(1, [eco(1_000_000), biz(3_000_000)]);
  assert.equal(mixed.fee, 1_650_000);
  assert.equal(mixed.refund, 2_350_000);
});

test("computeCancellationFee: phí mỗi khách không vượt quá phần tiền của khách đó, refund không âm", () => {
  const r = computeCancellationFee(10, [eco(500_000), eco(400_000)]); // phí lý thuyết 600k/khách
  assert.equal(r.fee, 900_000);
  assert.equal(r.refund, 0);
  assert.equal(r.tier, "none");
});

test("passengerShares: chia tiền chặng theo giá ghế + dịch vụ của từng khách, tổng khớp tiền chặng", () => {
  const booking = {
    passengers: [
      { seats: [{ flight_id: "F", seat_class: "economy", addons_amount: 330_000 }] },
      { seats: [{ flight_id: "F", seat_class: "business", addons_amount: 0 }] },
    ],
    flights: [{ flight_id: "F", amount: 4_000_000 }], // đã trừ khuyến mãi (gốc 1.33tr + 3tr)
  };
  const flightMap = { F: { base_price: { economy: 1_000_000, business: 3_000_000 } } };
  const shares = passengerShares({ booking, flightMap, legs: booking.flights });
  assert.equal(shares[0] + shares[1], 4_000_000);
  assert.equal(shares[0], Math.floor((4_000_000 * 1_330_000) / 4_330_000));
  // Thiếu giá (dữ liệu cũ) -> chia đều
  assert.deepEqual(passengerShares({ booking: { passengers: [{}, {}] }, flightMap: {}, legs: [{ flight_id: "X", amount: 1_000_001 }] }), [500_000, 500_001]);
});

// ---------------------------------------------------------------- A3: hoàn tiền tay
test("computeManualRefund: hoàn đủ -> tier full, phí 0", () => {
  assert.deepEqual(computeManualRefund(2_000_000, 2_000_000), {
    refund: 2_000_000,
    fee: 0,
    tier: "full",
  });
  assert.equal(computeManualRefund(2_000_000, "2000000").refund, 2_000_000); // chuỗi số cũng nhận
});

test("computeManualRefund: hoàn thiếu -> tier partial, phần chênh vào phí", () => {
  assert.deepEqual(computeManualRefund(2_000_000, 1_500_000), {
    refund: 1_500_000,
    fee: 500_000,
    tier: "partial",
  });
});

test("computeManualRefund: từ chối số tiền sai", () => {
  for (const bad of [0, -1, 1.5, "abc", null, undefined, 2_000_001]) {
    assert.throws(() => computeManualRefund(2_000_000, bad), { statusCode: 400 }, `bad=${bad}`);
  }
});

// ---------------------------------------------------------------- C6: quyết định webhook
test("decideWebhookAction: các nhánh", () => {
  assert.equal(decideWebhookAction({ status: "pending_payment", paid: true }), "confirm");
  assert.equal(decideWebhookAction({ status: "pending_payment", paid: false }), "fail");
  // Tiền đã trừ nhưng booking đã bị hủy trước đó -> phải báo admin hoàn tay (ghi chú y)
  assert.equal(
    decideWebhookAction({ status: "cancelled", paid: true, hasTransactionId: false }),
    "late_payment_error"
  );
  // IPN gửi lại cho booking đã ghi nhận giao dịch -> no-op (idempotent)
  assert.equal(
    decideWebhookAction({ status: "cancelled", paid: true, hasTransactionId: true }),
    "noop"
  );
  assert.equal(decideWebhookAction({ status: "confirmed", paid: true }), "noop");
  assert.equal(decideWebhookAction({ status: "refunded", paid: true }), "noop");
  // Thất bại trên booking đã hủy: không có gì để làm
  assert.equal(decideWebhookAction({ status: "cancelled", paid: false }), "noop");
});

// ---------------------------------------------------------------- C4: giấy tờ theo tuổi
const yearsAgo = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setDate(d.getDate() - 2); // lùi thêm vài ngày để chắc chắn đã qua sinh nhật
  return d;
};

test("validatePassengerDocument: người lớn >=14 tuổi", () => {
  const adult = { full_name: "A", date_of_birth: yearsAgo(30) };
  assert.doesNotThrow(() => validatePassengerDocument({ ...adult, document_type: "cccd", document_id: "012345678901" }));
  assert.doesNotThrow(() => validatePassengerDocument({ ...adult, document_type: "passport", document_id: "B1234567" }));
  assert.throws(() => validatePassengerDocument({ ...adult, document_type: "cccd", document_id: "" }), { statusCode: 400 });
  assert.throws(
    () => validatePassengerDocument({ ...adult, document_type: "birth_certificate", document_id: "X1" }),
    { statusCode: 400 }
  );
});

test("validatePassengerDocument: trẻ <14 tuổi", () => {
  const child = { full_name: "B", date_of_birth: yearsAgo(8) };
  assert.doesNotThrow(() => validatePassengerDocument({ ...child, document_type: "birth_certificate", document_id: "" }));
  assert.doesNotThrow(() => validatePassengerDocument({ ...child, document_type: "passport", document_id: "C7654321" }));
  assert.throws(() => validatePassengerDocument({ ...child, document_type: "cccd", document_id: "012345678901" }), {
    statusCode: 400,
  });
});

test("validateNoDuplicateDocumentIds: trùng thì lỗi, rỗng không tính trùng", () => {
  assert.throws(
    () =>
      validateNoDuplicateDocumentIds([
        { full_name: "A", document_id: "123" },
        { full_name: "B", document_id: " 123 " },
      ]),
    { statusCode: 400 }
  );
  assert.doesNotThrow(() =>
    validateNoDuplicateDocumentIds([
      { full_name: "A", document_id: "" },
      { full_name: "B", document_id: "" },
      { full_name: "C", document_id: "999" },
    ])
  );
});

// ---------------------------------------------------------------- C6 (z): transit khứ hồi
test("validateRoundTripTransit: tối thiểu 2 giờ", () => {
  const arrive = new Date("2026-11-01T10:00:00Z");
  const depAt = (h) => ({ departure_time: new Date(arrive.getTime() + h * HOUR) });
  assert.doesNotThrow(() => validateRoundTripTransit({ arrival_time: arrive }, depAt(2))); // đúng 2h
  assert.doesNotThrow(() => validateRoundTripTransit({ arrival_time: arrive }, depAt(30)));
  assert.throws(() => validateRoundTripTransit({ arrival_time: arrive }, depAt(1.99)), { statusCode: 400 });
  assert.throws(() => validateRoundTripTransit({ arrival_time: arrive }, depAt(-3)), { statusCode: 400 });
});

// ---------------------------------------------------------------- C10: khung check-in & múi giờ
test("isCheckInWindowOpen: mở 24h, đóng 2h trước giờ bay", () => {
  const dep = new Date("2026-11-10T08:00:00Z");
  const at = (hoursBefore) => new Date(dep.getTime() - hoursBefore * HOUR);
  assert.equal(isCheckInWindowOpen(dep, at(25)), false);
  assert.equal(isCheckInWindowOpen(dep, at(24)), true);
  assert.equal(isCheckInWindowOpen(dep, at(10)), true);
  assert.equal(isCheckInWindowOpen(dep, at(2)), true);
  assert.equal(isCheckInWindowOpen(dep, at(1.5)), false);
  assert.equal(isCheckInWindowOpen(dep, at(-1)), false); // đã bay
});

test("hoursUntil: không phụ thuộc múi giờ máy chủ", () => {
  const from = new Date("2026-11-10T00:00:00Z");
  const dep = new Date("2026-11-10T04:30:00Z");
  assert.equal(hoursUntil(dep, from), 4.5);
});

test("ageInYears: tính đúng quanh sinh nhật", () => {
  const dob = new Date("2012-06-15T00:00:00+07:00");
  assert.equal(ageInYears(dob, new Date("2026-06-14T12:00:00+07:00")), 13);
  assert.equal(ageInYears(dob, new Date("2026-06-15T12:00:00+07:00")), 14);
});
