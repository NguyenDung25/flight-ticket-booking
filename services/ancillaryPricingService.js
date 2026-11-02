const Setting = require("../models/Setting");
const { normalizePricing, pricingOrDefault, DEFAULT_PRICING } = require("../lib/ancillaries");

// Bảng giá chung lưu ở key này; bảng riêng của một hãng lưu ở `${PRICING_KEY}:${mã hãng}` (VD "ancillary_pricing:VN").
// Hãng chưa có bảng riêng dùng bảng chung.
const PRICING_KEY = "ancillary_pricing";

const keyFor = (airlineCode) => (airlineCode ? `${PRICING_KEY}:${String(airlineCode).toUpperCase()}` : PRICING_KEY);

/** @returns {Promise<Object>} bảng giá áp dụng cho hãng (không truyền hãng = bảng chung), đã kiểm tra */
async function getAncillaryPricing(airlineCode) {
  if (airlineCode) {
    const own = await Setting.findOne({ key: keyFor(airlineCode) }).lean();
    if (own) return pricingOrDefault(own.value);
  }
  const doc = await Setting.findOne({ key: PRICING_KEY }).lean();
  return pricingOrDefault(doc?.value);
}

/**
 * Bảng giá của nhiều hãng trong 1 lần đọc DB: { [mã hãng]: pricing, "": bảng chung }.
 * Hãng không có bảng riêng nhận bảng chung.
 */
async function getPricingByAirline(airlineCodes) {
  const codes = [...new Set(airlineCodes.filter(Boolean).map((c) => String(c).toUpperCase()))];
  const docs = await Setting.find({ key: { $in: [PRICING_KEY, ...codes.map(keyFor)] } }).lean();
  const byKey = new Map(docs.map((d) => [d.key, d.value]));
  const general = pricingOrDefault(byKey.get(PRICING_KEY));
  const result = { "": general };
  for (const code of codes) result[code] = byKey.has(keyFor(code)) ? pricingOrDefault(byKey.get(keyFor(code))) : general;
  return result;
}

/**
 * Thông tin hiển thị cho admin: bảng giá + lần sửa gần nhất.
 * has_own = hãng đang có bảng riêng; hãng chưa có thì `pricing` là bảng chung (đang kế thừa).
 */
async function getAncillaryPricingInfo(airlineCode) {
  const own = airlineCode ? await Setting.findOne({ key: keyFor(airlineCode) }).lean() : null;
  const doc = own ?? (await Setting.findOne({ key: PRICING_KEY }).lean());
  return {
    pricing: pricingOrDefault(doc?.value),
    updated_at: doc?.updated_at ?? null,
    is_default: !doc,
    has_own: Boolean(own),
  };
}

/** Mã hãng đang có bảng giá riêng (để admin thấy hãng nào đã chỉnh). */
async function listAirlinesWithOwnPricing() {
  const docs = await Setting.find({ key: { $regex: `^${PRICING_KEY}:` } }, "key").lean();
  return docs.map((d) => d.key.slice(PRICING_KEY.length + 1));
}

/** Admin lưu bảng giá mới (cho một hãng, hoặc bảng chung nếu không truyền hãng). */
async function updateAncillaryPricing({ raw, adminId, airlineCode }) {
  const pricing = normalizePricing(raw);
  await Setting.updateOne(
    { key: keyFor(airlineCode) },
    { $set: { value: pricing, updated_by: adminId } },
    { upsert: true }
  );
  return pricing;
}

/** Xóa bảng riêng của hãng -> hãng quay về dùng bảng chung. */
async function resetAirlinePricing(airlineCode) {
  if (!airlineCode) return;
  await Setting.deleteOne({ key: keyFor(airlineCode) });
}

module.exports = {
  PRICING_KEY,
  DEFAULT_PRICING,
  getAncillaryPricing,
  getPricingByAirline,
  getAncillaryPricingInfo,
  listAirlinesWithOwnPricing,
  updateAncillaryPricing,
  resetAirlinePricing,
};
