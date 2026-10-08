// tests/securityFixes.test.js
//
// Test cho các bản vá bảo mật/race-condition KHÔNG cần MongoDB: các nhánh này
// ném lỗi TRƯỚC khi chạm DB. Chạy: npm test

// lib/mongodb.js ném lỗi lúc nạp module nếu thiếu MONGO_URI (chỉ đọc biến, chưa
// kết nối) — đặt giá trị giả; các test dưới đây ném lỗi TRƯỚC khi chạm DB.
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/test";

const test = require("node:test");
const assert = require("node:assert/strict");

const seatService = require("../services/seatService");
const { registerUser } = require("../services/authService");

test("forceReleaseSeat: bắt buộc có userId (chống nhả nhầm ghế đã đổi chủ)", async () => {
  await assert.rejects(
    seatService.forceReleaseSeat({ flightId: "665f1c2e8b3a4d0012345678", seatNumber: "1A" }),
    /thiếu userId/
  );
});

test("registerUser: từ chối email sai định dạng ở server", async () => {
  for (const bad of ["abc", "a@b", "a b@c.com", "@x.com"]) {
    await assert.rejects(
      registerUser({ email: bad, password: "123456", full_name: "A" }),
      { statusCode: 400 },
      `email=${bad}`
    );
  }
});

test("registerUser: từ chối mật khẩu quá ngắn / quá dài ở server", async () => {
  await assert.rejects(
    registerUser({ email: "a@b.com", password: "1", full_name: "A" }),
    { statusCode: 400 }
  );
  await assert.rejects(
    registerUser({ email: "a@b.com", password: "x".repeat(129), full_name: "A" }),
    { statusCode: 400 }
  );
});
