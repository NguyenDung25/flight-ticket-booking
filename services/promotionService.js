const Promotion = require("../models/Promotion");
const { nowVN } = require("../lib/timezone");

class PromotionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Áp mã khuyến mãi khi tạo booking (C6). */
async function applyPromotion(code) {
  const promotion = await Promotion.findOne({ code: code.toUpperCase() });
  if (!promotion) {
    throw new PromotionError(`Mã khuyến mãi "${code}" không tồn tại.`, 404);
  }

  const now = nowVN().toDate();
  if (now < promotion.valid_from || now > promotion.valid_until) {
    throw new PromotionError(`Mã khuyến mãi "${code}" đã hết hiệu lực.`, 400);
  }

  // Update atomic — xử lý đúng 2 nhánh có/không usage_limit (ghi chú p), đã đóng gói sẵn ở model.
  const updated = await Promotion.incrementUsage(promotion.code);
  if (!updated) {
    // Trường hợp lọt qua check valid_from/valid_until ở trên nhưng vẫn thất bại ở bước tăng used_count.
    throw new PromotionError(`Mã khuyến mãi "${code}" đã hết lượt sử dụng.`, 409);
  }

  return updated;
}

/** Tính số tiền được giảm dựa trên discount_percent, áp trên tổng tiền trước giảm giá. */
function computeDiscountAmount(promotion, totalAmountBeforeDiscount) {
  return Math.floor((totalAmountBeforeDiscount * promotion.discount_percent) / 100);
}

/** Trừ tiền giảm giá của mã khuyến mãi vào flights[] của booking (sửa trực tiếp `legs`). */
function applyDiscountToLegs(legs, promotion) {
  const fareOf = (leg) => leg.amount - (leg.addons_amount || 0);
  const fareTotal = legs.reduce((sum, l) => sum + fareOf(l), 0);
  const discountAmount = computeDiscountAmount(promotion, fareTotal);
  let allocated = 0;
  legs.forEach((leg, i) => {
    const legDiscount =
      i === legs.length - 1
        ? discountAmount - allocated
        : fareTotal > 0
          ? Math.floor((fareOf(leg) * discountAmount) / fareTotal)
          : 0;
    leg.amount -= legDiscount;
    allocated += legDiscount;
  });
  return discountAmount;
}

/** Mã đang dùng được ngay bây giờ — cho trang Khuyến mãi phía khách: đã tới valid_from, chưa quá valid_until. */
async function listActivePromotions(now = nowVN().toDate()) {
  const docs = await Promotion.find({
    valid_from: { $lte: now },
    valid_until: { $gte: now },
    $or: [
      { usage_limit: { $exists: false } },
      { usage_limit: null },
      { $expr: { $lt: ["$used_count", "$usage_limit"] } },
    ],
  })
    .sort({ valid_until: 1 })
    .lean();

  return docs.map((p) => ({
    code: p.code,
    discount_percent: p.discount_percent,
    valid_until: p.valid_until,
    remaining: p.usage_limit === undefined || p.usage_limit === null ? null : Math.max(p.usage_limit - (p.used_count || 0), 0),
  }));
}

module.exports = {
  applyDiscountToLegs,
  PromotionError,
  applyPromotion,
  computeDiscountAmount,
  listActivePromotions,
};
