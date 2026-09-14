// services/promotionService.js
//
// A5 (tùy chọn, làm sau cùng — chỉ làm nếu còn thời gian sau tuần 7).
// Lớp mỏng gọi Promotion.incrementUsage() (đã có atomic update ở model,
// ghi chú p), thêm kiểm tra hiệu lực thời gian (valid_from/valid_until)
// TRƯỚC khi thử tăng used_count.

const Promotion = require("../models/Promotion");
const { nowVN } = require("../lib/timezone");

class PromotionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Áp mã khuyến mãi khi tạo booking (C6). Trả về Promotion doc đã tăng
 * used_count nếu hợp lệ, ném lỗi rõ ràng nếu không áp dụng được — để client
 * hiển thị đúng lý do (hết hạn / hết lượt / mã không tồn tại) thay vì 1
 * thông báo chung chung.
 *
 * LƯU Ý: hàm này chỉ ĐƯỢC GỌI 1 LẦN cho mỗi booking, đúng lúc tạo booking —
 * không gọi lại khi retry thanh toán, tránh tăng used_count nhiều lần cho
 * cùng 1 booking.
 *
 * @param {String} code
 * @returns {Promise<Object>} Promotion doc đã cập nhật
 */
async function applyPromotion(code) {
  const promotion = await Promotion.findOne({ code: code.toUpperCase() });
  if (!promotion) {
    throw new PromotionError(`Mã khuyến mãi "${code}" không tồn tại.`, 404);
  }

  const now = nowVN().toDate();
  if (now < promotion.valid_from || now > promotion.valid_until) {
    throw new PromotionError(`Mã khuyến mãi "${code}" đã hết hiệu lực.`, 400);
  }

  // Update atomic — xử lý đúng 2 nhánh có/không usage_limit (ghi chú p), đã
  // đóng gói sẵn ở model, KHÔNG tự viết lại điều kiện ở đây để tránh lệch
  // logic giữa nhiều nơi gọi.
  const updated = await Promotion.incrementUsage(promotion.code);
  if (!updated) {
    // Trường hợp lọt qua check valid_from/valid_until ở trên nhưng vẫn thất
    // bại ở bước tăng used_count — nghĩa là mã đã hết lượt dùng (usage_limit)
    // đúng thời điểm race-condition giữa lúc check và lúc update.
    throw new PromotionError(`Mã khuyến mãi "${code}" đã hết lượt sử dụng.`, 409);
  }

  return updated;
}

/**
 * Tính số tiền được giảm dựa trên discount_percent, áp trên tổng tiền TRƯỚC
 * giảm giá (Σ flights[].amount — ghi chú t). Làm tròn xuống đơn vị đồng.
 */
function computeDiscountAmount(promotion, totalAmountBeforeDiscount) {
  return Math.floor((totalAmountBeforeDiscount * promotion.discount_percent) / 100);
}

module.exports = {
  PromotionError,
  applyPromotion,
  computeDiscountAmount,
};
