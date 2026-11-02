const test = require("node:test");
const assert = require("node:assert/strict");
const { getSupportEmail } = require("../lib/supportContact");

test("getSupportEmail: lấy địa chỉ trong EMAIL_FROM dạng 'Tên <địa chỉ>'", () => {
  assert.equal(getSupportEmail({ EMAIL_FROM: '"DelayX" <hotro@example.com>' }), "hotro@example.com");
});

test("getSupportEmail: EMAIL_FROM chỉ có địa chỉ", () => {
  assert.equal(getSupportEmail({ EMAIL_FROM: "hotro@example.com" }), "hotro@example.com");
});

test("getSupportEmail: không có EMAIL_FROM thì dùng SMTP_USER", () => {
  assert.equal(getSupportEmail({ SMTP_USER: "smtp@example.com" }), "smtp@example.com");
});

test("getSupportEmail: thiếu cấu hình hoặc giá trị không phải email thì trả về null", () => {
  assert.equal(getSupportEmail({}), null);
  assert.equal(getSupportEmail({ EMAIL_FROM: "không phải email" }), null);
});
