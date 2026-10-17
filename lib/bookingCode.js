const { BOOKING_CODE_LENGTH } = require("../config/constants");

const BOOKING_CODE_RE = new RegExp(`^[A-Z0-9]{${BOOKING_CODE_LENGTH}}$`);
const MAX_NAME_LENGTH = 100; // khớp giới hạn full_name khi đặt vé

/** Bỏ khoảng trắng, đổi sang chữ hoa ("v9c hgp" -> "V9CHGP"). */
function normalizeBookingCode(value) {
  if (typeof value !== "string") return null;
  const code = value.replace(/\s+/g, "").toUpperCase();
  return BOOKING_CODE_RE.test(code) ? code : null;
}

/** Họ tên để so khớp (không lưu): bỏ dấu tiếng Việt, đ -> D, chữ hoa, gộp khoảng trắng. */
function normalizePassengerName(value) {
  if (typeof value !== "string" || value.length > MAX_NAME_LENGTH * 2) return null;
  const name = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Khách nhập có khớp hành khách `fullName` trong booking không — như website hãng bay chỉ hỏi "Họ": nhận họ. */
function passengerNameMatches(fullName, input) {
  const full = normalizePassengerName(fullName);
  const given = normalizePassengerName(input);
  if (!full || !given) return false;
  if (given === full) return true;
  const words = full.split(" ");
  return given === words[0] || given === words[words.length - 1];
}

module.exports = { normalizeBookingCode, normalizePassengerName, passengerNameMatches };
