const { clientIp } = require("./clientIp");
const { lockRemainingMs, recordFailure } = require("./loginThrottle");

const REGISTER_TOO_MANY_MESSAGE = "Bạn đăng ký quá nhiều lần. Vui lòng thử lại sau ít phút.";

/** @returns {boolean} true nếu được đăng ký (và đã tính 1 lượt), false nếu đang bị chặn */
function allowRegisterAttempt(headers, now = Date.now()) {
  const key = `register-ip:${clientIp(headers)}`;
  if (lockRemainingMs(key, now) > 0) return false;
  recordFailure(key, now);
  return true;
}

module.exports = { allowRegisterAttempt, REGISTER_TOO_MANY_MESSAGE };
