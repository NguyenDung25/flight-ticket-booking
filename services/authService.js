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
const { lockRemainingMs, recordFailure, reset } = require("../lib/loginThrottle");

// bcrypt chỉ dùng 72 byte đầu của mật khẩu — mật khẩu dài hơn sẽ bị cắt ÂM THẦM, nên chặn rõ ràng.
const BCRYPT_MAX_PASSWORD_BYTES = 72;
const FULL_NAME_MAX_LENGTH = 100;

// Hash giả để vẫn chạy bcrypt khi email không tồn tại → thời gian phản hồi không lộ email nào có
// trong hệ thống (chống dò email qua timing).
let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_SALT_ROUNDS);
  return dummyHash;
}

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Quy tắc mật khẩu mới — dùng chung cho đăng ký, đổi mật khẩu, đặt lại mật khẩu
 * (services/accountService.js): chuỗi, tối thiểu 6 ký tự, tối đa 72 byte (giới hạn của bcrypt).
 * @throws {AuthError} 400
 */
function assertValidNewPassword(password) {
  if (typeof password !== "string") {
    throw new AuthError("Mật khẩu phải là chuỗi.", 400);
  }
  if (password.length < 6) {
    throw new AuthError("Mật khẩu phải có ít nhất 6 ký tự.", 400);
  }
  if (password.length > 128 || Buffer.byteLength(password, "utf8") > BCRYPT_MAX_PASSWORD_BYTES) {
    throw new AuthError(
      `Mật khẩu quá dài (tối đa ${BCRYPT_MAX_PASSWORD_BYTES} byte, ký tự có dấu tính nhiều byte).`,
      400
    );
  }
}

/** Họ tên đã trim, 1–FULL_NAME_MAX_LENGTH ký tự. @throws {AuthError} 400 */
function normalizeFullName(fullName) {
  const name = typeof fullName === "string" ? fullName.trim() : "";
  if (name.length < 1 || name.length > FULL_NAME_MAX_LENGTH) {
    throw new AuthError(`Họ tên phải từ 1 đến ${FULL_NAME_MAX_LENGTH} ký tự.`, 400);
  }
  return name;
}

/**
 * Bỏ `password_hash` trước khi trả User ra ngoài service — KHÔNG BAO GIỜ để
 * hash mật khẩu lọt ra route/response/session, kể cả khi đã hash (giảm bề
 * mặt rò rỉ nếu response bị log hoặc lộ qua lỗi khác).
 */
function sanitizeUser(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  // Bỏ cả dữ liệu đặt lại mật khẩu (token hash, hạn dùng) — chỉ dùng nội bộ services/accountService.js.
  const {
    password_hash,
    password_reset_token_hash,
    password_reset_expires,
    password_reset_requested_at,
    ...safe
  } = obj;
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
  if (typeof email !== "string" || typeof password !== "string" || typeof full_name !== "string") {
    throw new AuthError("email, password, full_name phải là chuỗi.", 400);
  }
  full_name = normalizeFullName(full_name);
  const allowedLanguages = User.schema.path("preferred_language")?.enumValues;
  if (preferred_language !== undefined && preferred_language !== null && preferred_language !== "") {
    if (typeof preferred_language !== "string" || (allowedLanguages && !allowedLanguages.includes(preferred_language))) {
      throw new AuthError("Ngôn ngữ không được hỗ trợ.", 400);
    }
  }
  // Validate email format và độ dài password ở server — HTML minLength/type=email
  // chỉ chặn ở UI, gọi API trực tiếp vẫn vượt qua nếu không có check này.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email.trim())) {
    throw new AuthError("Địa chỉ email không hợp lệ.", 400);
  }
  assertValidNewPassword(password);

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
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    throw new AuthError("email và password đều là bắt buộc.", 401);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Giới hạn số lần đăng nhập sai (kiểm tra TRƯỚC khi tốn công băm bcrypt).
  if (lockRemainingMs(normalizedEmail) > 0) {
    throw new AuthError("Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ít phút.", 429);
  }

  await dbConnect();

  const user = await User.findOne({ email: normalizedEmail });

  // Luôn chạy bcrypt (hash giả nếu không có user) để thời gian phản hồi không phân biệt được.
  const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : getDummyHash());
  if (!user || !passwordMatches) {
    recordFailure(normalizedEmail);
    throw new AuthError("Email hoặc mật khẩu không đúng.", 401);
  }

  if (user.is_blocked) {
    throw new AuthError("Tài khoản đã bị khóa.", 403);
  }

  reset(normalizedEmail);
  return sanitizeUser(user);
}

module.exports = {
  AuthError,
  assertValidNewPassword,
  normalizeFullName,
  sanitizeUser,
  registerUser,
  verifyCredentials,
};
