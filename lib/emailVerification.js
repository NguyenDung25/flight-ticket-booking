// lib/emailVerification.js
//
// Tạo token + gửi link xác thực email (dùng chung cho đăng ký, API đăng ký và nút "Gửi lại").
// Link: <base>/<locale>/verify-email?token=... — base lấy NEXT_PUBLIC_BASE_URL, không có thì origin
// của request hiện tại.

const { createEmailVerification, EMAIL_VERIFY_TTL_HOURS } = require("../services/accountService");
const { sendVerificationEmail } = require("./emailClient");

/**
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.origin - origin của request (dùng khi chưa đặt NEXT_PUBLIC_BASE_URL)
 * @param {boolean} [params.force] - bỏ qua giới hạn gửi lại (ngay sau khi đăng ký)
 * @returns {Promise<boolean>} true nếu đã gửi email thật (false: chưa cấu hình SMTP / gửi lỗi)
 * @throws {AuthError} 409 đã xác thực, 429 gửi lại quá sớm
 */
async function sendEmailVerificationLink({ userId, origin, force = false }) {
  const { token, user } = await createEmailVerification({ userId, force });
  const locale = user.preferred_language === "en" ? "en" : "vi";
  const base = (process.env.NEXT_PUBLIC_BASE_URL || origin || "").replace(/\/+$/, "");
  return sendVerificationEmail({
    to: user.email,
    name: user.full_name,
    link: `${base}/${locale}/verify-email?token=${token}`,
    locale,
    hours: EMAIL_VERIFY_TTL_HOURS,
  });
}

module.exports = { sendEmailVerificationLink };
