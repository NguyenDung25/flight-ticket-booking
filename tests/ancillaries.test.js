process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_PRICING,
  normalizePricing,
  pricingOrDefault,
  baggageOptions,
  baggagePrice,
  priceAddons,
  checkedBaggageAllowance,
} = require("../lib/ancillaries");
const { applyAddons, computeLegAmount, ValidationError } = require("../services/bookingValidationService");
const { buildEmailHtml } = require("../lib/emailClient");
const { localizeApiMessage } = require("../lib/apiMessages");

const P20 = baggagePrice(20);
const MEAL = DEFAULT_PRICING.meal_price.economy;

/** Bảng giá admin hợp lệ dùng trong test (khác mặc định). */
const customRaw = () => ({
  carry_on_kg: "10",
  included_checked_kg: { economy: 5, business: 40 },
  baggage_packages: [
    { kg: 35, price: 500_000 },
    { kg: "10", price: "120000" },
  ],
  meal_price: { economy: 99_000, business: 0 },
  meal_included: { economy: false, business: true },
});

test("priceAddons (bảng giá mặc định): phổ thông trả tiền hành lý + suất ăn; không chọn gì thì 0đ", () => {
  assert.deepEqual(priceAddons({}, "economy"), {
    baggage_kg: 0, meal: false, addons_amount: 0, carry_on_kg: 7, checked_baggage_kg: 0,
  });
  const r = priceAddons({ baggage_kg: 20, meal: true }, "economy");
  assert.equal(r.addons_amount, P20 + MEAL);
  assert.equal(r.checked_baggage_kg, 20);
  // Giá trị chuỗi từ form (select) vẫn nhận.
  assert.equal(priceAddons({ baggage_kg: "15" }, "economy").addons_amount, baggagePrice(15));
});

test("priceAddons: thương gia đã gồm suất ăn (0đ) + 30kg ký gửi, vẫn mua thêm hành lý được", () => {
  const r = priceAddons({ meal: false }, "business");
  assert.equal(r.meal, true);
  assert.equal(r.addons_amount, 0);
  assert.equal(r.checked_baggage_kg, 30);
  assert.equal(priceAddons({ baggage_kg: 30 }, "business").checked_baggage_kg, 60);
});

test("priceAddons: gói hành lý không có trong bảng giá / số âm / số lẻ bị từ chối", () => {
  for (const bad of [10, -15, 20.5, "abc", 1000]) {
    assert.throws(() => priceAddons({ baggage_kg: bad }, "economy"), (e) => e.statusCode === 400, String(bad));
  }
});

test("meal chỉ nhận đúng true — chuỗi 'false'/'true' không được tính là có suất ăn", () => {
  assert.equal(priceAddons({ meal: "false" }, "economy").meal, false);
  assert.equal(priceAddons({ meal: "true" }, "economy").meal, false);
});

test("normalizePricing: chuẩn hóa số dạng chuỗi, sắp gói theo kg; tính giá theo bảng giá mới", () => {
  const pricing = normalizePricing(customRaw());
  assert.deepEqual(pricing.baggage_packages, [{ kg: 10, price: 120_000 }, { kg: 35, price: 500_000 }]);
  assert.equal(pricing.carry_on_kg, 10);
  assert.deepEqual(baggageOptions(pricing), [0, 10, 35]);

  const r = priceAddons({ baggage_kg: 35, meal: true }, "economy", pricing);
  assert.deepEqual(r, { baggage_kg: 35, meal: true, addons_amount: 599_000, carry_on_kg: 10, checked_baggage_kg: 40 });
  // Gói 20kg không còn trong bảng giá mới.
  assert.throws(() => priceAddons({ baggage_kg: 20 }, "economy", pricing), /chọn 0\/10\/35 kg/);
  // Không có gói nào -> chỉ chọn được 0kg.
  const none = normalizePricing({ ...customRaw(), baggage_packages: [] });
  assert.deepEqual(baggageOptions(none), [0]);
});

test("normalizePricing: từ chối giá âm, kg trùng, quá nhiều gói, thiếu trường", () => {
  const cases = [
    { ...customRaw(), carry_on_kg: -1 },
    { ...customRaw(), meal_price: { economy: -5, business: 0 } },
    { ...customRaw(), baggage_packages: [{ kg: 20, price: 1 }, { kg: 20, price: 2 }] },
    { ...customRaw(), baggage_packages: Array.from({ length: 9 }, (_, i) => ({ kg: i + 1, price: 1 })) },
    { ...customRaw(), baggage_packages: [{ kg: 0, price: 1 }] },
    { ...customRaw(), baggage_packages: [{ kg: 20, price: 99_000_000 }] },
    { ...customRaw(), included_checked_kg: undefined },
    null,
  ];
  for (const c of cases) assert.throws(() => normalizePricing(c), (e) => e.statusCode === 400);
});

test("pricingOrDefault: dữ liệu DB hỏng/thiếu -> dùng bảng giá mặc định", () => {
  assert.equal(pricingOrDefault(null), DEFAULT_PRICING);
  assert.equal(pricingOrDefault({ carry_on_kg: "x" }), DEFAULT_PRICING);
  assert.equal(pricingOrDefault(customRaw()).carry_on_kg, 10);
});

test("checkedBaggageAllowance: gồm phần miễn phí theo hạng + gói mua thêm", () => {
  assert.equal(checkedBaggageAllowance("economy", 0), 0);
  assert.equal(checkedBaggageAllowance("business", 15), 45);
  assert.equal(checkedBaggageAllowance("economy", undefined), 0); // booking cũ
});

test("applyAddons ghi đè giá client gửi theo bảng giá truyền vào; computeLegAmount cộng vào tiền chặng", () => {
  const pricing = normalizePricing(customRaw());
  const passengers = [
    { seats: [{ flight_id: "f1", seat_number: "1A", seat_class: "economy", baggage_kg: 10, meal: true, addons_amount: 1 }] },
    { seats: [{ flight_id: "f1", seat_number: "1B", seat_class: "business", addons_amount: 999_999 }] },
  ];
  applyAddons(passengers, pricing);
  assert.equal(passengers[0].seats[0].addons_amount, 120_000 + 99_000);
  assert.equal(passengers[0].seats[0].checked_baggage_kg, 15);
  assert.equal(passengers[1].seats[0].addons_amount, 0);
  assert.equal(passengers[1].seats[0].checked_baggage_kg, 40);

  const amount = computeLegAmount(passengers, "f1", { f1: { economy: 1_000_000, business: 3_000_000 } });
  assert.equal(amount, 1_000_000 + 3_000_000 + 219_000);
});

test("applyAddons: gói hành lý sai -> ValidationError 400; lỗi dịch được sang tiếng Anh", () => {
  const passengers = [{ seats: [{ flight_id: "f1", seat_number: "1A", seat_class: "economy", baggage_kg: 12 }] }];
  let err;
  assert.throws(() => applyAddons(passengers), (e) => (err = e) instanceof ValidationError && e.statusCode === 400);
  assert.equal(localizeApiMessage(err.message, "en"), "Invalid checked baggage package (choose 0/15/20/25/30 kg).");
});

test("email vé: hiện hành lý ký gửi + suất ăn, đúng ngôn ngữ", () => {
  const base = {
    booking_code: "ABC123",
    total_amount: 1_330_000,
    legs: [{ leg: "outbound", flight_number: "VN1", origin_code: "HAN", dest_code: "SGN", departure_time: new Date(), arrival_time: new Date() }],
    passengers: [{ full_name: "Nguyen Van A", seats: [{ seat_number: "1A", checked_baggage_kg: 20, meal: true }] }],
  };
  assert.match(buildEmailHtml({ ...base, locale: "vi" }), /ghế 1A \(ký gửi 20kg, suất ăn\)/);
  assert.match(buildEmailHtml({ ...base, locale: "en" }), /seat 1A \(20kg checked baggage, meal\)/);
});
