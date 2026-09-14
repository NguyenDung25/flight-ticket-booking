// models/Promotion.js
//
// Bám sát mục 7 (Promotion) của mongodb-schema-design.md.
// A5 — tùy chọn, làm sau cùng nếu còn thời gian.
//
// Ghi chú (p) — 2 điểm dễ sai khi code:
// 1) "Không giới hạn" có thể là usage_limit KHÔNG TỒN TẠI (field vắng mặt)
//    hoặc tồn tại nhưng = null tường minh — phải check cả 2 dạng, chỉ
//    $exists: false sẽ bỏ sót trường hợp lưu null tường minh.
// 2) Khi booking dùng mã bị hủy → KHÔNG giảm lại used_count (đánh đổi có chủ
//    đích để tránh race-condition, không phải bug).

const mongoose = require("mongoose");
const { Schema } = mongoose;

const PromotionSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    discount_percent: { type: Number, required: true, min: 0, max: 100 },
    valid_from: { type: Date, required: true },
    valid_until: { type: Date, required: true },
    usage_limit: { type: Number, default: null }, // null/undefined = không giới hạn
    used_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

PromotionSchema.index({ code: 1 }, { unique: true });

PromotionSchema.pre("validate", function (next) {
  if (this.valid_until <= this.valid_from) {
    return next(new Error("valid_until phải sau valid_from."));
  }
  next();
});

/**
 * Update atomic tăng used_count, chống vượt hạn mức do race-condition đồng
 * thời (ghi chú p). Gọi hàm này thay vì tự viết updateOne rải rác ở nhiều nơi
 * — giữ đúng 1 chỗ xử lý logic "có/không usage_limit" để tránh lệch nhau.
 *
 * @param {String} code
 * @returns {Promise<Object|null>} document đã cập nhật, hoặc null nếu không
 *   áp dụng được (mã không tồn tại, hết hạn mức, hoặc hết hiệu lực thời gian
 *   — tùy điều kiện `extraMatch` truyền vào ở service gọi hàm này).
 */
PromotionSchema.statics.incrementUsage = async function (code) {
  const Promotion = this;

  // Nhánh 1: có giới hạn — chỉ tăng nếu used_count < usage_limit
  const limited = await Promotion.findOneAndUpdate(
    {
      code,
      usage_limit: { $exists: true, $ne: null },
      $expr: { $lt: ["$used_count", "$usage_limit"] },
    },
    { $inc: { used_count: 1 } },
    { new: true }
  );
  if (limited) return limited;

  // Nhánh 2: không giới hạn — tăng thẳng, KHÔNG so sánh used_count < usage_limit
  // (usage_limit rỗng sẽ chặn nhầm nếu lỡ đưa vào cùng điều kiện $expr ở trên)
  const unlimited = await Promotion.findOneAndUpdate(
    {
      code,
      $or: [{ usage_limit: { $exists: false } }, { usage_limit: null }],
    },
    { $inc: { used_count: 1 } },
    { new: true }
  );

  return unlimited || null; // null = mã không tồn tại hoặc đã hết hạn mức (có usage_limit và used_count >= usage_limit)
};

module.exports = mongoose.models.Promotion || mongoose.model("Promotion", PromotionSchema);
