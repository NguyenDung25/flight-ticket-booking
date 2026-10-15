// tests/promotionsPage.test.js — trang Khuyến mãi chỉ hiện mã ĐANG dùng được; trang Chính sách hủy
// vé dùng đúng hằng số với services/cancellationService.js. Không cần MongoDB (stub tại chỗ).
process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const Promotion = require("../models/Promotion");
const { listActivePromotions } = require("../services/promotionService");

test("listActivePromotions: lọc theo hạn + còn lượt, trả số lượt còn lại (null = không giới hạn)", async () => {
  const now = new Date("2026-10-15T04:00:00Z");
  let captured;
  const orig = Promotion.find;
  Promotion.find = (filter) => {
    captured = filter;
    return {
      sort: () => ({
        lean: async () => [
          { code: "A15", discount_percent: 15, valid_until: new Date("2026-11-01"), usage_limit: 100, used_count: 3 },
          { code: "FREE", discount_percent: 5, valid_until: new Date("2026-12-01"), usage_limit: null, used_count: 9 },
          { code: "NOLIM", discount_percent: 7, valid_until: new Date("2026-12-01") },
        ],
      }),
    };
  };
  try {
    const list = await listActivePromotions(now);
    assert.deepEqual(captured.valid_from, { $lte: now });
    assert.deepEqual(captured.valid_until, { $gte: now });
    // Còn lượt: không có usage_limit, usage_limit null, hoặc used_count < usage_limit — cùng điều kiện
    // với Promotion.incrementUsage() khi khách áp mã.
    assert.equal(captured.$or.length, 3);
    assert.deepEqual(captured.$or[2], { $expr: { $lt: ["$used_count", "$usage_limit"] } });
    assert.deepEqual(list.map((p) => [p.code, p.remaining]), [["A15", 97], ["FREE", null], ["NOLIM", null]]);
  } finally {
    Promotion.find = orig;
  }
});
