// models/Setting.js
//
// Cấu hình hệ thống do admin sửa trên giao diện (key -> value). Hiện dùng cho bảng giá dịch vụ bổ sung
// (key "ancillary_pricing", services/ancillaryPricingService.js). Giá trị luôn được kiểm tra ở service
// trước khi ghi; đọc ra cũng kiểm tra lại (hỏng thì dùng mặc định).

const mongoose = require("mongoose");
const { Schema } = mongoose;

const SettingSchema = new Schema(
  {
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

SettingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
