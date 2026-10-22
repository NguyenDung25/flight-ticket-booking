const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeDocumentId, isValidDocumentId, sanitizeDocumentIdInput } = require("../lib/bookingContact");
const { validatePassengerDocument, validateNoDuplicateDocumentIds } = require("../services/bookingValidationService");

const adult = (document_type, document_id) => ({ full_name: "A", date_of_birth: "1990-01-01", document_type, document_id });

test("số giấy tờ: chuẩn hóa bỏ khoảng trắng, viết hoa", () => {
  assert.equal(normalizeDocumentId(" 0010 9001 2345 "), "001090012345");
  assert.equal(normalizeDocumentId("c1234567"), "C1234567");
  assert.equal(normalizeDocumentId(undefined), "");
});

test("số giấy tờ: định dạng theo loại", () => {
  assert.ok(isValidDocumentId("cccd", "001090012345"));
  assert.ok(!isValidDocumentId("cccd", "00109001234")); // 11 số
  assert.ok(!isValidDocumentId("cccd", "00109001234A"));
  assert.ok(isValidDocumentId("birth_certificate", "123456"));
  assert.ok(!isValidDocumentId("birth_certificate", "12A"));
  assert.ok(isValidDocumentId("passport", "C1234567"));
  assert.ok(!isValidDocumentId("passport", "C12"));
});

test("số giấy tờ: lọc ký tự khi gõ", () => {
  assert.equal(sanitizeDocumentIdInput("cccd", "001 090-abc 012345 999"), "001090012345");
  assert.equal(sanitizeDocumentIdInput("passport", "c 123-4567"), "C1234567");
  assert.equal(sanitizeDocumentIdInput("birth_certificate", "12 a 3"), "123");
});

test("validatePassengerDocument: lưu số đã chuẩn hóa, chặn sai định dạng", () => {
  const p = adult("cccd", " 0010 9001 2345 ");
  validatePassengerDocument(p);
  assert.equal(p.document_id, "001090012345");
  assert.throws(() => validatePassengerDocument(adult("cccd", "12345")), { statusCode: 400, message: /không đúng định dạng/ });
  assert.throws(() => validatePassengerDocument(adult("passport", "C1")), { statusCode: 400, message: /không đúng định dạng/ });
});

test("validateNoDuplicateDocumentIds: số trùng sau khi chuẩn hóa vẫn bị chặn", () => {
  assert.throws(
    () => validateNoDuplicateDocumentIds([
      { full_name: "A", document_id: "001090012345" },
      { full_name: "B", document_id: "0010 9001 2345" },
    ]),
    { statusCode: 400, message: /bị trùng/ }
  );
  assert.throws(
    () => validateNoDuplicateDocumentIds([
      { full_name: "A", document_id: "c1234567" },
      { full_name: "B", document_id: "C1234567" },
    ]),
    { statusCode: 400 }
  );
});
