// services/authService.js
//
// C8 — đăng ký + xác thực đăng nhập. Việc CẤP session/token thật (JWT/cookie)
// nằm ở NextAuth (`/api/auth/[...nextauth]`, dùng CredentialsProvider gọi
// `verifyCredentials()` bên dưới) — service này CHỈ lo phần dữ liệu: hash mật
// khẩu, chống trùng email, kiểm tra is_blocked. KHÔNG tự phát hành token ở đây.
//
// API liên quan: POST /api/auth/register, NextAuth /api/auth/[...nextauth]

const bcrypt = require("bcryptjs");
const User = require("../models/User");
const dbConnect = require("../lib/mongodb");
const { BCRYPT_SALT_ROUNDS } = require("../config/constants");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Bỏ `password_hash` trước khi trả User ra ngoài service — KHÔNG BAO GIỜ để
 * hash mật khẩu lọt ra route/response/session, kể cả khi đã hash (giảm bề
 * mặt rò rỉ nếu response bị log hoặc lộ qua lỗi khác).
 */
function sanitizeUser(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  const { password_hash, ...safe } = obj;
  return safe;
}

/**
 * C8 — đăng ký tài khoản mới. Từ chối nếu `email` đã tồn tại **bất kể**
 * `is_blocked` — tránh tài khoản bị khóa dùng lại chính email cũ để né lệnh
 * khóa (đúng ghi chú C8, KHÔNG được chỉ check `is_blocked: false`).
 *
 * KHÔNG nhận `role` từ input dù client có gửi lên — luôn ép `customer`,
 * đúng ghi chú "không cho tự chọn role". `preferred_language` mặc định lấy
 * theo schema (`vi`) nếu không truyền, KHÔNG suy luận từ Accept-Language ở
 * tầng này (việc đó, nếu làm, thuộc về API route/middleware).
 *
 * @param {Object} params
 * @param {String} params.email
 * @param {String} params.password - plain text, sẽ bị hash ngay, không lưu lại
 * @param {String} params.full_name
 * @param {"vi"|"en"} [params.preferred_language]
 * @returns {Promise<Object>} User đã tạo, KHÔNG có password_hash
 * @throws {AuthError} 409 nếu email đã tồn tại
 */
async function registerUser({ email, password, full_name, preferred_language }) {
  if (!email || !password || !full_name) {
    throw new AuthError("email, password, full_name đều là bắt buộc.");
  }

  await dbConnect();

  const normalizedEmail = email.trim().toLowerCase();

  // Check tường minh TRƯỚC insert để trả lỗi 409 rõ ràng — index unique ở
  // User model (ghi chú C8) chỉ là lớp bảo vệ CUỐI chống race-condition,
  // không thay thế bước check này.
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AuthError("Email đã được sử dụng.", 409);
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const user = await User.create({
    email: normalizedEmail,
    password_hash,
    full_name,
    ...(preferred_language ? { preferred_language } : {}),
    // role KHÔNG truyền — luôn dùng default "customer" của schema
  });

  return sanitizeUser(user);
}

/**
 * C8 — xác thực email/mật khẩu, dùng làm `authorize()` cho NextAuth
 * CredentialsProvider. Luôn trả lỗi CHUNG CHUNG "Email hoặc mật khẩu không
 * đúng" cho cả 2 trường hợp (email không tồn tại / sai mật khẩu) — tránh lộ
 * thông tin email nào đã đăng ký cho kẻ dò quét (user enumeration).
 *
 * Đọc `is_blocked` TRỰC TIẾP từ DB ngay tại đây (ghi chú q) — đúng thời điểm
 * đăng nhập, không dựa vào bất kỳ giá trị cache/session cũ nào.
 *
 * @returns {Promise<Object>} User đã xác thực, KHÔNG có password_hash
 * @throws {AuthError} 401 nếu sai email/mật khẩu, 403 nếu tài khoản bị khóa
 */
async function verifyCredentials({ email, password }) {
  if (!email || !password) {
    throw new AuthError("email và password đều là bắt buộc.", 401);
  }

  await dbConnect();

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw new AuthError("Email hoặc mật khẩu không đúng.", 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new AuthError("Email hoặc mật khẩu không đúng.", 401);
  }

  // Check SAU KHI xác thực mật khẩu đúng — tránh lộ qua thời gian phản hồi
  // (timing side-channel) việc 1 email có tồn tại/bị khóa hay không cho
  // người chưa biết đúng mật khẩu.
  if (user.is_blocked) {
    throw new AuthError("Tài khoản đã bị khóa.", 403);
  }

  return sanitizeUser(user);
}

module.exports = {
  AuthError,
  registerUser,
  verifyCredentials,
};
