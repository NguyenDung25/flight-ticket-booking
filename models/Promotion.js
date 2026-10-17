const mongoose = require("mongoose");
const { Schema } = mongoose;

const PromotionSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    discount_percent: { type: Number, required: true, min: 0, max: 100 },
    valid_from: { type: Date, required: true },
    valid_until: { type: Date, required: true },
    usage_limit: { type: Number, default: null, min: [0, "Hạn mức sử dụng không được âm."] }, // null/undefined = không giới hạn
    used_count: { type: Number, default: 0, min: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

PromotionSchema.index({ code: 1 }, { unique: true });

PromotionSchema.pre("validate", function () {
  // Mongoose 9 đã bỏ callback-style middleware (tham số next) — báo lỗi bằng throw.
  if (this.valid_until <= this.valid_from) {
    throw new Error("valid_until phải sau valid_from.");
  }
});

/** Update atomic tăng used_count, chống vượt hạn mức do race-condition đồng thời (ghi chú p). */
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

  // Nhánh 2: không giới hạn — tăng thẳng, không so sánh used_count < usage_limit.
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
