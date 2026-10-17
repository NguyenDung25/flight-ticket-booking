const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true }, // bcrypt — không bao giờ lưu plain text
    full_name: { type: String, required: true },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    is_blocked: { type: Boolean, default: false },
    preferred_language: { type: String, enum: ["vi", "en"], default: "vi" }, // C11

    // Tài khoản — đổi / quên mật khẩu (services/accountService.js).
    password_changed_at: { type: Date, default: null },
    // Chỉ lưu SHA-256 của token đặt lại mật khẩu (token gốc chỉ nằm trong link gửi email).
    password_reset_token_hash: { type: String, default: null, select: false },
    password_reset_expires: { type: Date, default: null, select: false },
    password_reset_requested_at: { type: Date, default: null, select: false },

    // Xác thực email (services/accountService.js).
    email_verified: { type: Boolean, default: true },
    email_verify_token_hash: { type: String, default: null, select: false },
    email_verify_expires: { type: Date, default: null, select: false },
    email_verify_sent_at: { type: Date, default: null, select: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Lớp bảo vệ cuối chống đăng ký trùng do race-condition (C8).
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ password_reset_token_hash: 1 }, { sparse: true });
UserSchema.index({ email_verify_token_hash: 1 }, { sparse: true });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
