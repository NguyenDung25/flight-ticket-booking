// lib/registerGuard.js
//
// Giới hạn số lần đăng ký theo IP. Mỗi lần đăng ký thành công gửi 1 email xác thực thật, nên không
// chặn thì form đăng ký thành công cụ gửi mail hàng loạt tới địa chỉ bất kỳ (spam người khác, làm
// tài khoản Gmail của hệ thống bị khóa). Đếm MỌI lần gọi (kể cả lỗi) — tối đa 5 lần / 15 phút / IP,
// dùng chung bộ đếm trong bộ nhớ với đăng nhập (lib/loginThrottle.js). IP lấy qua lib/clientIp.js.

const { clientIp } = require("./clientIp");
const { lockRemainingMs, recordFailure } = require("./loginThrottle");

const REGISTER_TOO_MANY_MESSAGE = "Bạn đăng ký quá nhiều lần. Vui lòng thử lại sau ít phút.";

/** @returns {boolean} true nếu ĐƯỢC đăng ký (và đã tính 1 lượt), false nếu đang bị chặn */
function allowRegisterAttempt(headers, now = Date.now()) {
  const key = `register-ip:${clientIp(headers)}`;
  if (lockRemainingMs(key, now) > 0) return false;
  recordFailure(key, now);
  return true;
}

module.exports = { allowRegisterAttempt, REGISTER_TOO_MANY_MESSAGE };
