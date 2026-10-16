// lib/requireVerifiedEmail.js
//
// Tài khoản đăng ký mới phải xác thực email trước khi giữ ghế / tạo booking — vé điện tử và thông
// báo đổi lịch bay đều gửi qua email, nên không cho đặt vé bằng email chưa chứng minh là có thật.
// Tài khoản cũ / seed / admin không có trường này -> mặc định coi là đã xác thực (models/User.js).
// Gọi SAU requireActiveUser() (cần User document đọc thẳng từ DB, không tin JWT).

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
