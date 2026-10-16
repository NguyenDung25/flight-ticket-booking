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

    // Tài khoản — đổi / quên mật khẩu (services/accountService.js).
    // Lần đổi mật khẩu gần nhất: phiên đăng nhập (JWT) cấp TRƯỚC thời điểm này bị coi là hết hiệu
    // lực (lib/requireActiveUser.js) — đổi mật khẩu là đăng xuất mọi thiết bị khác.
    password_changed_at: { type: Date, default: null },
    // Chỉ lưu SHA-256 của token đặt lại mật khẩu (token gốc chỉ nằm trong link gửi email).
    password_reset_token_hash: { type: String, default: null, select: false },
    password_reset_expires: { type: Date, default: null, select: false },
    password_reset_requested_at: { type: Date, default: null, select: false },

    // Xác thực email (services/accountService.js). Mặc định true để tài khoản có từ trước (seed,
    // tài khoản demo, admin) không bị chặn; CHỈ tài khoản đăng ký mới được ghi false cho tới khi
    // bấm link trong email. Chưa xác thực thì chưa được giữ ghế / đặt vé (lib/requireVerifiedEmail.js).
    email_verified: { type: Boolean, default: true },
    email_verify_token_hash: { type: String, default: null, select: false },
    email_verify_expires: { type: Date, default: null, select: false },
    email_verify_sent_at: { type: Date, default: null, select: false },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Lớp bảo vệ cuối chống đăng ký trùng do race-condition (C8) — không thay thế
// cho việc check findOne({ email }) ở tầng service trước khi insert, vì cần
// trả lỗi rõ ràng (409) thay vì để MongoDB ném lỗi duplicate key thô.
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ password_reset_token_hash: 1 }, { sparse: true });
UserSchema.index({ email_verify_token_hash: 1 }, { sparse: true });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
