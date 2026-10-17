const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

class ContactError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

/** Số điện thoại: bỏ khoảng trắng, dấu chấm, gạch, ngoặc; cho phép "+" ở đầu; 9–15 chữ số. */
function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const phone = value.replace(/[\s.\-()]/g, "");
  return /^\+?\d{9,15}$/.test(phone) ? phone : null;
}

/** Email đã trim + chữ thường; null nếu không hợp lệ. */
function normalizeContactEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email) ? email : null;
}

function normalizeContact(contact) {
  if (!contact || typeof contact !== "object") {
    throw new ContactError("Vui lòng nhập thông tin liên hệ (email và số điện thoại).");
  }
  const email = normalizeContactEmail(contact.email);
  if (!email) throw new ContactError("Email liên hệ không hợp lệ.");
  const phone = normalizePhone(contact.phone);
  if (!phone) throw new ContactError("Số điện thoại liên hệ không hợp lệ (9–15 chữ số).");
  return { email, phone };
}

module.exports = { ContactError, normalizePhone, normalizeContactEmail, normalizeContact };
