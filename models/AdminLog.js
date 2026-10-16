// models/AdminLog.js
//
// Nhật ký thao tác của quản trị viên (bổ sung A1–A8): ai đã làm gì, lúc nào, trên đối tượng nào — để
// đối soát khi có khiếu nại (VD ai đã hủy vé hộ khách, ai hoàn tiền tay bao nhiêu, ai khóa tài khoản).
// Chỉ GHI THÊM (append-only): không có API sửa/xóa nhật ký. Ghi qua lib/adminLog.js.

const mongoose = require("mongoose");
const { Schema } = mongoose;

const ADMIN_LOG_ACTIONS = [
  "flight.create",
  "flight.update",
  "flight.delete",
  "flight.cancel_bulk",
  "booking.cancel",
  "booking.manual_refund",
  "user.block",
  "user.unblock",
  "user.delete",
  "promotion.create",
  "promotion.update",
  "promotion.delete",
  "aircraft.create",
  "aircraft.update",
  "aircraft.delete",
  "airline.create",
  "airline.update",
  "airline.delete",
  "popular_route.create",
  "popular_route.update",
  "popular_route.delete",
  "popular_route.seed_defaults",
  "popular_route.image_update",
  "popular_route.image_delete",
  "ancillary.update",
];

const AdminLogSchema = new Schema(
  {
    admin_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Chụp lại email lúc thao tác — tài khoản admin có thể bị đổi/xóa sau này.
    admin_email: { type: String, required: true },
    action: { type: String, enum: ADMIN_LOG_ACTIONS, required: true },
    target_type: { type: String, required: true }, // "flight" | "booking" | "user" | ...
    target_id: { type: String, default: null },
    summary: { type: String, required: true }, // câu mô tả ngắn, tiếng Việt (giao diện admin cố định tiếng Việt)
    details: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

AdminLogSchema.index({ created_at: -1 });
AdminLogSchema.index({ action: 1, created_at: -1 });
AdminLogSchema.index({ target_type: 1, target_id: 1 });

const AdminLog = mongoose.models.AdminLog || mongoose.model("AdminLog", AdminLogSchema);
module.exports = AdminLog;
module.exports.ADMIN_LOG_ACTIONS = ADMIN_LOG_ACTIONS;
