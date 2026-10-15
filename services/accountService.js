// services/accountService.js
//
// Tài khoản khách hàng (bổ sung C8): sửa hồ sơ, đổi mật khẩu, quên mật khẩu / đặt lại mật khẩu.
//
// - Đổi hoặc đặt lại mật khẩu ghi `password_changed_at` -> mọi phiên đăng nhập cấp trước đó hết hiệu
//   lực (lib/requireActiveUser.js), kể cả phiên của người đang dùng mật khẩu cũ trên máy khác.
// - Token đặt lại mật khẩu: 32 byte ngẫu nhiên, chỉ lưu SHA-256 trong DB, hết hạn sau
//   PASSWORD_RESET_TTL_MINUTES, dùng 1 lần.
// - Quên mật khẩu KHÔNG cho biết email có tồn tại hay không (route luôn trả cùng 1 câu).
//
// API liên quan: PATCH /api/users/me, POST /api/users/me/password,
//                POST /api/auth/forgot-password, POST /api/auth/reset-password

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { BCRYPT_SALT_ROUNDS } = require("../config/constants");
const { lockRemainingMs, recordFailure, reset } = require("../lib/loginThrottle");
const { AuthError, assertValidNewPassword, normalizeFullName } = require("./authService");

const PASSWORD_RESET_TTL_MINUTES = 30;
// Gửi lại link quên mật khẩu cho cùng 1 email tối thiểu cách nhau chừng này (chống spam hộp thư).
const PASSWORD_RESET_RESEND_SECONDS = 60;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Sửa họ tên hiển thị. Email không đổi được ở đây (là định danh đăng nhập). */
async function updateProfile({ user, fullName }) {
  const name = normalizeFullName(fullName);
  await User.updateOne({ _id: user._id }, { $set: { full_name: name } });
  return { full_name: name };
}

/**
 * Đổi mật khẩu khi đang đăng nhập: phải nhập đúng mật khẩu hiện tại (sai 5 lần thì khóa tạm, dùng
 * chung bộ đếm với đăng nhập). Thành công -> các phiên cũ (kể cả phiên hiện tại) phải đăng nhập lại.
 *
 * @throws {AuthError} 400 mật khẩu mới không hợp lệ/trùng mật khẩu cũ, 401 sai mật khẩu hiện tại,
 *   429 sai quá nhiều lần
 */
async function changePassword({ user, currentPassword, newPassword }) {
  const key = `pwchange:${user._id}`;
  if (lockRemainingMs(key) > 0) {
    throw new AuthError("Nhập sai mật khẩu hiện tại quá nhiều lần. Vui lòng thử lại sau ít phút.", 429);
  }
  if (typeof currentPassword !== "string" || !currentPassword) {
    throw new AuthError("Vui lòng nhập mật khẩu hiện tại.", 400);
  }
  assertValidNewPassword(newPassword);

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) {
    recordFailure(key);
    throw new AuthError("Mật khẩu hiện tại không đúng.", 401);
  }
  reset(key);
  if (currentPassword === newPassword) {
    throw new AuthError("Mật khẩu mới phải khác mật khẩu hiện tại.", 400);
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        password_hash: await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS),
        password_changed_at: new Date(),
        password_reset_token_hash: null,
        password_reset_expires: null,
      },
    }
  );
}

/**
 * Quên mật khẩu: nếu email thuộc 1 tài khoản đang hoạt động thì tạo token đặt lại mật khẩu.
 * Trả null (KHÔNG ném lỗi) khi email không tồn tại / bị khóa / vừa yêu cầu cách đây chưa đủ
 * PASSWORD_RESET_RESEND_SECONDS — route trả cùng 1 thông báo cho mọi trường hợp.
 *
 * @returns {Promise<{ token: string, user: Object, expiresAt: Date } | null>}
 */
async function requestPasswordReset({ email, now = new Date() }) {
  if (typeof email !== "string" || !email.trim() || email.length > 254) return null;
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password_reset_requested_at");
  if (!user || user.is_blocked) return null;

  const last = user.password_reset_requested_at;
  if (last && now - new Date(last) < PASSWORD_RESET_RESEND_SECONDS * 1000) return null;

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        password_reset_token_hash: hashToken(token),
        password_reset_expires: expiresAt,
        password_reset_requested_at: now,
      },
    }
  );
  return { token, user, expiresAt };
}

/**
 * Đặt lại mật khẩu bằng token trong link email. Token dùng 1 lần (xóa ngay khi đặt lại thành công,
 * điều kiện atomic trên token + hạn dùng) và mọi phiên đăng nhập cũ hết hiệu lực.
 *
 * @throws {AuthError} 400 token sai/hết hạn hoặc mật khẩu mới không hợp lệ
 */
async function resetPassword({ token, newPassword, now = new Date() }) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
    throw new AuthError("Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400);
  }
  assertValidNewPassword(newPassword);

  const updated = await User.findOneAndUpdate(
    { password_reset_token_hash: hashToken(token), password_reset_expires: { $gt: now }, is_blocked: false },
    {
      $set: {
        password_hash: await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS),
        password_changed_at: now,
        password_reset_token_hash: null,
        password_reset_expires: null,
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) {
    throw new AuthError("Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400);
  }
  // Mở khóa tạm do đăng nhập sai (nếu có) — người dùng vừa chứng minh sở hữu email.
  reset(updated.email);
  return { email: updated.email };
}

module.exports = {
  PASSWORD_RESET_TTL_MINUTES,
  hashToken,
  updateProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
};
