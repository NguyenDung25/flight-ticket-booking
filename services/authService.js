const bcrypt = require("bcryptjs");
const User = require("../models/User");
const dbConnect = require("../lib/mongodb");
const { BCRYPT_SALT_ROUNDS } = require("../config/constants");
const { lockRemainingMs, recordFailure, reset } = require("../lib/loginThrottle");

// bcrypt chỉ dùng 72 byte đầu của mật khẩu — mật khẩu dài hơn sẽ bị cắt âm thầm, nên chặn rõ ràng.
const BCRYPT_MAX_PASSWORD_BYTES = 72;
const FULL_NAME_MAX_LENGTH = 100;

// Hash giả để vẫn chạy bcrypt khi email không tồn tại → thời gian phản hồi không lộ email nào có trong hệ thống…
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

/** Quy tắc mật khẩu mới — dùng chung cho đăng ký, đổi mật khẩu, đặt lại mật khẩu (services/accountService.js). */
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

/** Bỏ `password_hash` trước khi trả User ra ngoài service. */
function sanitizeUser(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  // Bỏ cả dữ liệu đặt lại mật khẩu (token hash, hạn dùng) — chỉ dùng nội bộ services/accountService.js.
  const {
    password_hash,
    password_reset_token_hash,
    password_reset_expires,
    password_reset_requested_at,
    email_verify_token_hash,
    email_verify_expires,
    email_verify_sent_at,
    ...safe
  } = obj;
  return safe;
}

/** C8 — đăng ký tài khoản mới. */
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
  // Validate email format và độ dài password ở server — HTML minLength/type=email chỉ chặn ở UI.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email.trim())) {
    throw new AuthError("Địa chỉ email không hợp lệ.", 400);
  }
  assertValidNewPassword(password);

  await dbConnect();

  const normalizedEmail = email.trim().toLowerCase();

  // Check tường minh trước insert để trả lỗi 409 rõ ràng — index unique ở User model.
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
    email_verified: false, // phải bấm link xác thực trong email mới được đặt vé
    // role không truyền — luôn dùng default "customer" của schema
  });

  return sanitizeUser(user);
}

/** C8 — xác thực email/mật khẩu, dùng làm `authorize()` cho NextAuth CredentialsProvider. */
async function verifyCredentials({ email, password }) {
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    throw new AuthError("email và password đều là bắt buộc.", 401);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Giới hạn số lần đăng nhập sai (kiểm tra trước khi tốn công băm bcrypt).
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
