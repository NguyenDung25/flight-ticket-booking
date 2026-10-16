// services/ancillaryPricingService.js
//
// Bảng giá dịch vụ bổ sung (hành lý ký gửi, suất ăn) — đọc/ghi Setting key "ancillary_pricing".
// Chưa có trong DB (hoặc dữ liệu hỏng) -> DEFAULT_PRICING của lib/ancillaries.js. Đổi bảng giá chỉ áp
// dụng cho booking tạo SAU đó: booking đã tạo lưu sẵn giá + số kg của từng ghế.

const Setting = require("../models/Setting");
const { normalizePricing, pricingOrDefault, DEFAULT_PRICING } = require("../lib/ancillaries");

const PRICING_KEY = "ancillary_pricing";

/** @returns {Promise<Object>} bảng giá hiện hành (plain object, đã kiểm tra) */
async function getAncillaryPricing() {
  const doc = await Setting.findOne({ key: PRICING_KEY }).lean();
  return pricingOrDefault(doc?.value);
}

/** Thông tin hiển thị cho admin: bảng giá + lần sửa gần nhất (null = đang dùng mặc định). */
async function getAncillaryPricingInfo() {
  const doc = await Setting.findOne({ key: PRICING_KEY }).lean();
  return { pricing: pricingOrDefault(doc?.value), updated_at: doc?.updated_at ?? null, is_default: !doc };
}

/**
 * Admin lưu bảng giá mới.
 * @throws {AncillaryError} 400 dữ liệu không hợp lệ (message tiếng Việt, hiện thẳng cho admin)
 */
async function updateAncillaryPricing({ raw, adminId }) {
  const pricing = normalizePricing(raw);
  await Setting.updateOne(
    { key: PRICING_KEY },
    { $set: { value: pricing, updated_by: adminId } },
    { upsert: true }
  );
  return pricing;
}

module.exports = { PRICING_KEY, DEFAULT_PRICING, getAncillaryPricing, getAncillaryPricingInfo, updateAncillaryPricing };
