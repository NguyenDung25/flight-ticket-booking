const { ActiveUserError } = require("./requireActiveUser");

const EMAIL_NOT_VERIFIED_MESSAGE =
  "Vui lòng xác thực email trước khi đặt vé. Kiểm tra hộp thư hoặc gửi lại email xác thực ở trang Tài khoản.";

/** @throws {ActiveUserError} 403 nếu email chưa xác thực */
function requireVerifiedEmail(user) {
  if (user?.email_verified === false) {
    throw new ActiveUserError(EMAIL_NOT_VERIFIED_MESSAGE, 403);
  }
  return user;
}

module.exports = { requireVerifiedEmail, EMAIL_NOT_VERIFIED_MESSAGE };
