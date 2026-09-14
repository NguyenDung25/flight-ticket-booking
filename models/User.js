// models/User.js
//
// Bám sát mục 1 (User) của mongodb-schema-design.md.
// Lưu ý quan trọng (ghi chú q): is_blocked chỉ đáng tin khi đọc TRỰC TIẾP từ DB
// ngay tại thời điểm thực hiện hành động nhạy cảm (tạo booking, thanh toán...),
// KHÔNG dựa vào session/token đã cấp trước đó — token có thể còn hiệu lực dù
// admin vừa khóa tài khoản. Việc này nằm ở middleware (requireActiveUser),
// không phải ở schema này.

const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true }, // bcrypt — KHÔNG bao giờ lưu plain text
    full_name: { type: String, required: true },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    is_blocked: { type: Boolean, default: false },
    preferred_language: { type: String, enum: ["vi", "en"], default: "vi" }, // C11
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Lớp bảo vệ cuối chống đăng ký trùng do race-condition (C8) — không thay thế
// cho việc check findOne({ email }) ở tầng service trước khi insert, vì cần
// trả lỗi rõ ràng (409) thay vì để MongoDB ném lỗi duplicate key thô.
UserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
