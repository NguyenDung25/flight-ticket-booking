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

// Định dạng số giấy tờ theo loại: CCCD 12 chữ số, giấy khai sinh chỉ gồm chữ số, hộ chiếu 6–9 chữ cái hoặc chữ số.
const DOCUMENT_ID_RULES = {
  cccd: /^\d{12}$/,
  birth_certificate: /^\d{1,20}$/,
  passport: /^[A-Z0-9]{6,9}$/,
};

/** Số giấy tờ để lưu và so sánh: bỏ mọi khoảng trắng, viết hoa (hộ chiếu có chữ cái). */
function normalizeDocumentId(value) {
  return typeof value === "string" ? value.replace(/\s+/g, "").toUpperCase() : "";
}

function isValidDocumentId(type, id) {
  const rule = DOCUMENT_ID_RULES[type];
  return Boolean(rule && rule.test(id));
}

/** Lọc ký tự khi đang gõ: hộ chiếu giữ chữ cái và chữ số, các loại khác chỉ giữ chữ số. */
function sanitizeDocumentIdInput(type, value) {
  if (typeof value !== "string") return "";
  return type === "passport"
    ? value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 9)
    : value.replace(/\D/g, "").slice(0, type === "cccd" ? 12 : 20);
}

module.exports = {
  ContactError,
  normalizePhone,
  normalizeContactEmail,
  normalizeContact,
  normalizeDocumentId,
  isValidDocumentId,
  sanitizeDocumentIdInput,
};
