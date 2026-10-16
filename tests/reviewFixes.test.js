// tests/reviewFixes.test.js — lỗi tìm được khi rà soát sau khi thêm hành lý/suất ăn và xác thực email:
// (1) mã khuyến mãi chỉ giảm trên giá vé, không giảm dịch vụ bổ sung, vẫn giữ total = Σ flights[].amount;
// (2) giới hạn số lần đăng ký theo IP (mỗi lần đăng ký gửi 1 email thật). Không cần MongoDB.
process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const { applyDiscountToLegs } = require("../services/promotionService");
const { allowRegisterAttempt } = require("../lib/registerGuard");

const sum = (legs) => legs.reduce((s, l) => s + l.amount, 0);

test("khuyến mãi: chỉ giảm trên giá vé, tiền hành lý/suất ăn giữ nguyên", () => {
  // 1 chặng: vé 1.000.000 + dịch vụ 330.000, giảm 10% -> giảm 100.000 (không phải 133.000)
  const legs = [{ amount: 1_330_000, addons_amount: 330_000 }];
  assert.equal(applyDiscountToLegs(legs, { discount_percent: 10 }), 100_000);
  assert.equal(legs[0].amount, 1_230_000);
});

test("khuyến mãi khứ hồi: chia theo tỷ lệ giá vé từng chặng, tổng giảm đúng, bất biến tổng giữ nguyên", () => {
  // Chặng đi: vé 1.500.000 + dịch vụ 250.000; chặng về: vé 1.200.000, không dịch vụ. Giảm 15%.
  const legs = [
    { amount: 1_750_000, addons_amount: 250_000 },
    { amount: 1_200_000, addons_amount: 0 },
  ];
  const before = sum(legs);
  const discount = applyDiscountToLegs(legs, { discount_percent: 15 });
  assert.equal(discount, Math.floor(2_700_000 * 0.15)); // 405.000 trên giá vé 2.700.000
  assert.equal(sum(legs), before - discount);
  assert.equal(legs[0].amount, 1_750_000 - 225_000); // 15% của 1.500.000
  assert.equal(legs[1].amount, 1_200_000 - 180_000); // 15% của 1.200.000
});

test("khuyến mãi: số lẻ làm tròn dồn vào chặng cuối, tổng giảm không lệch đồng nào", () => {
  const legs = [
    { amount: 333_333, addons_amount: 0 },
    { amount: 333_334, addons_amount: 80_000 },
    { amount: 999_999 }, // booking cũ không có addons_amount
  ];
  const before = sum(legs);
  const discount = applyDiscountToLegs(legs, { discount_percent: 7 });
  assert.equal(discount, Math.floor((333_333 + 253_334 + 999_999) * 0.07));
  assert.equal(before - sum(legs), discount);
  assert.ok(legs.every((l) => l.amount >= 0));
});

test("khuyến mãi 100%: chỉ còn tiền dịch vụ bổ sung", () => {
  const legs = [{ amount: 1_080_000, addons_amount: 80_000 }];
  applyDiscountToLegs(legs, { discount_percent: 100 });
  assert.equal(legs[0].amount, 80_000);
});

test("đăng ký: tối đa 5 lần / 15 phút / IP, IP khác không bị ảnh hưởng, hết hạn chặn thì đăng ký lại được", () => {
  // Bật TRUST_PROXY để phân biệt IP qua X-Forwarded-For (mặc định mọi request chung 1 khóa "direct").
  process.env.TRUST_PROXY = "true";
  try {
    const ipA = new Headers({ "x-forwarded-for": "203.0.113.7" });
    const ipB = new Headers({ "x-forwarded-for": "192.0.2.44" });
    const t0 = Date.now();
    const attempts = Array.from({ length: 6 }, () => allowRegisterAttempt(ipA, t0));
    assert.deepEqual(attempts, [true, true, true, true, true, false]);
    assert.equal(allowRegisterAttempt(ipB, t0), true);
    assert.equal(allowRegisterAttempt(ipA, t0 + 16 * 60 * 1000), true);
  } finally {
    delete process.env.TRUST_PROXY;
  }
});
