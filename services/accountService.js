const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { BCRYPT_SALT_ROUNDS } = require("../config/constants");
const { lockRemainingMs, recordFailure, reset } = require("../lib/loginThrottle");
const { AuthError, assertValidNewPassword, normalizeFullName } = require("./authService");

const PASSWORD_RESET_TTL_MINUTES = 30;
// Gửi lại link quên mật khẩu cho cùng 1 email tối thiểu cách nhau chừng này (chống spam hộp thư).
const PASSWORD_RESET_RESEND_SECONDS = 60;

const EMAIL_VERIFY_TTL_HOURS = 24;
// Gửi lại link xác thực tối thiểu cách nhau chừng này.
const EMAIL_VERIFY_RESEND_SECONDS = 60;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/** Sửa họ tên hiển thị. Email không đổi được ở đây (là định danh đăng nhập). */
async function updateProfile({ user, fullName }) {
  const name = normalizeFullName(fullName);
  await User.updateOne({ _id: user._id }, { $set: { full_name: name } });
  return { full_name: name };
}

/** Đổi mật khẩu khi đang đăng nhập: phải nhập đúng mật khẩu hiện tại. */
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

/** Quên mật khẩu: nếu email thuộc 1 tài khoản đang hoạt động thì tạo token đặt lại mật khẩu. */
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

/** Đặt lại mật khẩu bằng token trong link email. */
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

/** Tạo token xác thực email cho tài khoản chưa xác thực (ghi đè token cũ — link cũ hết hiệu lực). */
async function createEmailVerification({ userId, now = new Date(), force = false }) {
  const user = await User.findById(userId).select("+email_verify_sent_at");
  if (!user) throw new AuthError("Tài khoản không tồn tại.", 401);
  if (user.email_verified !== false) throw new AuthError("Email đã được xác thực.", 409);

  const last = user.email_verify_sent_at;
  if (!force && last && now - new Date(last) < EMAIL_VERIFY_RESEND_SECONDS * 1000) {
    throw new AuthError("Bạn vừa yêu cầu gửi email xác thực. Vui lòng đợi 1 phút rồi thử lại.", 429);
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFY_TTL_HOURS * 60 * 60 * 1000);
  await User.updateOne(
    { _id: user._id, email_verified: false },
    { $set: { email_verify_token_hash: hashToken(token), email_verify_expires: expiresAt, email_verify_sent_at: now } }
  );
  return { token, expiresAt, user };
}

/** Xác thực email bằng token trong link (atomic: token đúng + còn hạn, xóa token ngay khi dùng). */
async function verifyEmail({ token, now = new Date() }) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
    throw new AuthError("Link xác thực email không hợp lệ hoặc đã hết hạn.", 400);
  }
  const updated = await User.findOneAndUpdate(
    { email_verify_token_hash: hashToken(token), email_verify_expires: { $gt: now } },
    { $set: { email_verified: true, email_verify_token_hash: null, email_verify_expires: null } },
    { returnDocument: "after" }
  );
  if (!updated) {
    throw new AuthError("Link xác thực email không hợp lệ hoặc đã hết hạn.", 400);
  }
  return { email: updated.email };
}

module.exports = {
  PASSWORD_RESET_TTL_MINUTES,
  EMAIL_VERIFY_TTL_HOURS,
  createEmailVerification,
  verifyEmail,
  hashToken,
  updateProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
};
