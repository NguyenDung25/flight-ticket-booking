// lib/bookingCode.js
//
// Chuẩn hóa + kiểm tra dữ liệu khách tự gõ khi check-in online (C10): mã vé điện tử (mã đặt chỗ,
// Booking.booking_code) và họ (hoặc họ tên) hành khách. Không phụ thuộc DB nên dùng được cả ở server lẫn client.
// Mã do services/ticketService.js sinh: BOOKING_CODE_LENGTH ký tự chữ HOA + số.

const { BOOKING_CODE_LENGTH } = require("../config/constants");

const BOOKING_CODE_RE = new RegExp(`^[A-Z0-9]{${BOOKING_CODE_LENGTH}}$`);
const MAX_NAME_LENGTH = 100; // khớp giới hạn full_name khi đặt vé

/**
 * Bỏ khoảng trắng, đổi sang chữ hoa ("v9c hgp" -> "V9CHGP"). Trả về null nếu không phải chuỗi hoặc sai
 * định dạng — chặn luôn object kiểu { $ne: "" } trước khi đưa vào truy vấn MongoDB.
 */
function normalizeBookingCode(value) {
  if (typeof value !== "string") return null;
  const code = value.replace(/\s+/g, "").toUpperCase();
  return BOOKING_CODE_RE.test(code) ? code : null;
}

/**
 * Họ tên để SO KHỚP (không lưu): bỏ dấu tiếng Việt, đ -> D, chữ hoa, gộp khoảng trắng — giống cách
 * website hãng bay nhận "Nguyễn Văn A" hay "NGUYEN VAN A" như nhau. null nếu rỗng/không phải chuỗi.
 */
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

/**
 * Khách nhập có khớp hành khách `fullName` trong booking không — như website hãng bay chỉ hỏi "Họ":
 * nhận HỌ (từ đầu, kiểu Việt Nam: "Nguyễn" trong "Nguyễn Văn A"), hoặc từ cuối (kiểu phương Tây:
 * "Smith" trong "John Smith"), hoặc nguyên họ tên. So khớp sau khi bỏ dấu/hoa thường (normalizePassengerName).
 */
function passengerNameMatches(fullName, input) {
  const full = normalizePassengerName(fullName);
  const given = normalizePassengerName(input);
  if (!full || !given) return false;
  if (given === full) return true;
  const words = full.split(" ");
  return given === words[0] || given === words[words.length - 1];
}

module.exports = { normalizeBookingCode, normalizePassengerName, passengerNameMatches };
