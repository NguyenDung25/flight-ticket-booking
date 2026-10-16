// tests/ancillaries.test.js — hành lý ký gửi + suất ăn (lib/ancillaries.js): giá tính ở server theo hạng
// ghế thật, cộng vào tiền chặng; email/vé hiển thị đúng. Không cần MongoDB.
process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BAGGAGE_PACKAGES,
  MEAL_PRICE,
  priceAddons,
  checkedBaggageAllowance,
} = require("../lib/ancillaries");
const { applyAddons, computeLegAmount, ValidationError } = require("../services/bookingValidationService");
const { buildEmailHtml } = require("../lib/emailClient");

test("priceAddons: phổ thông trả tiền hành lý + suất ăn; không chọn gì thì 0đ", () => {
  assert.deepEqual(priceAddons({}, "economy"), { baggage_kg: 0, meal: false, addons_amount: 0 });
  assert.deepEqual(priceAddons({ baggage_kg: 20, meal: true }, "economy"), {
    baggage_kg: 20,
    meal: true,
    addons_amount: BAGGAGE_PACKAGES[20] + MEAL_PRICE.economy,
  });
  // Giá trị chuỗi từ form (select) vẫn nhận.
  assert.equal(priceAddons({ baggage_kg: "15" }, "economy").addons_amount, BAGGAGE_PACKAGES[15]);
});

test("priceAddons: thương gia đã gồm suất ăn (0đ), vẫn mua thêm hành lý được", () => {
  assert.deepEqual(priceAddons({ meal: false }, "business"), { baggage_kg: 0, meal: true, addons_amount: 0 });
  assert.equal(priceAddons({ baggage_kg: 30 }, "business").addons_amount, BAGGAGE_PACKAGES[30]);
});

test("priceAddons: gói hành lý không có trong bảng giá / số âm / số lẻ bị từ chối", () => {
  for (const bad of [10, -15, 20.5, "abc", 1000]) {
    assert.throws(() => priceAddons({ baggage_kg: bad }, "economy"), (e) => e.statusCode === 400, String(bad));
  }
});

test("meal chỉ nhận đúng true — chuỗi 'false' không bị tính là có suất ăn", () => {
  assert.equal(priceAddons({ meal: "false" }, "economy").meal, false);
  assert.equal(priceAddons({ meal: "true" }, "economy").meal, false);
});

test("checkedBaggageAllowance: gồm phần miễn phí theo hạng + gói mua thêm", () => {
  assert.equal(checkedBaggageAllowance("economy", 0), 0);
  assert.equal(checkedBaggageAllowance("economy", 20), 20);
  assert.equal(checkedBaggageAllowance("business", 0), 30);
  assert.equal(checkedBaggageAllowance("business", 15), 45);
  assert.equal(checkedBaggageAllowance("economy", undefined), 0); // booking cũ
});

test("applyAddons ghi đè giá client gửi, computeLegAmount cộng dịch vụ vào tiền chặng", () => {
  const passengers = [
    { seats: [{ flight_id: "f1", seat_number: "1A", seat_class: "economy", baggage_kg: 20, meal: true, addons_amount: 1 }] },
    { seats: [{ flight_id: "f1", seat_number: "1B", seat_class: "business", addons_amount: 999_999 }] },
  ];
  applyAddons(passengers);
  assert.equal(passengers[0].seats[0].addons_amount, BAGGAGE_PACKAGES[20] + MEAL_PRICE.economy);
  assert.equal(passengers[1].seats[0].addons_amount, 0);
  assert.equal(passengers[1].seats[0].meal, true);

  const amount = computeLegAmount(passengers, "f1", { f1: { economy: 1_000_000, business: 3_000_000 } });
  assert.equal(amount, 1_000_000 + 3_000_000 + BAGGAGE_PACKAGES[20] + MEAL_PRICE.economy);
});

test("applyAddons: gói hành lý sai -> ValidationError 400 (route trả lỗi rõ ràng)", () => {
  const passengers = [{ seats: [{ flight_id: "f1", seat_number: "1A", seat_class: "economy", baggage_kg: 12 }] }];
  assert.throws(() => applyAddons(passengers), (e) => e instanceof ValidationError && e.statusCode === 400);
});

test("email vé: hiện hành lý ký gửi + suất ăn, đúng ngôn ngữ", () => {
  const base = {
    booking_code: "ABC123",
    total_amount: 1_330_000,
    legs: [{ leg: "outbound", flight_number: "VN1", origin_code: "HAN", dest_code: "SGN", departure_time: new Date(), arrival_time: new Date() }],
    passengers: [{ full_name: "Nguyen Van A", seats: [{ seat_number: "1A", checked_baggage_kg: 20, meal: true }] }],
  };
  const vi = buildEmailHtml({ ...base, locale: "vi" });
  assert.match(vi, /ghế 1A \(ký gửi 20kg, suất ăn\)/);
  const en = buildEmailHtml({ ...base, locale: "en" });
  assert.match(en, /seat 1A \(20kg checked baggage, meal\)/);
});
