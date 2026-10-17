process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const AdminLog = require("../models/AdminLog");
const account = require("../services/accountService");
const { isSessionOlderThanPasswordChange } = require("../lib/requireActiveUser");
const { normalizeContact, normalizePhone } = require("../lib/bookingContact");
const { logAdminAction, compactDetails } = require("../lib/adminLog");

const patch = (obj, props) => {
  const saved = {};
  for (const k of Object.keys(props)) { saved[k] = obj[k]; obj[k] = props[k]; }
  return () => Object.assign(obj, saved);
};

// ---------- đổi mật khẩu ----------
test("changePassword: đúng mật khẩu hiện tại -> lưu hash mới + password_changed_at", async () => {
  const user = { _id: "u-change-1", password_hash: await bcrypt.hash("old-pass", 4) };
  let update;
  const restore = patch(User, { updateOne: async (_f, u) => { update = u; return {}; } });
  try {
    await account.changePassword({ user, currentPassword: "old-pass", newPassword: "new-pass-123" });
    assert.ok(await bcrypt.compare("new-pass-123", update.$set.password_hash));
    assert.ok(update.$set.password_changed_at instanceof Date);
    assert.equal(update.$set.password_reset_token_hash, null);
  } finally { restore(); }
});

test("changePassword: sai mật khẩu hiện tại -> 401; mật khẩu mới yếu/trùng -> 400; không ghi DB", async () => {
  const user = { _id: "u-change-2", password_hash: await bcrypt.hash("old-pass", 4) };
  let writes = 0;
  const restore = patch(User, { updateOne: async () => { writes += 1; return {}; } });
  try {
    await assert.rejects(account.changePassword({ user, currentPassword: "wrong", newPassword: "new-pass-123" }), { statusCode: 401 });
    await assert.rejects(account.changePassword({ user, currentPassword: "old-pass", newPassword: "123" }), { statusCode: 400 });
    await assert.rejects(account.changePassword({ user, currentPassword: "old-pass", newPassword: "old-pass" }), { statusCode: 400 });
    await assert.rejects(account.changePassword({ user, currentPassword: "", newPassword: "new-pass-123" }), { statusCode: 400 });
    assert.equal(writes, 0);
  } finally { restore(); }
});

test("changePassword: sai mật khẩu hiện tại 5 lần -> khóa tạm 429", async () => {
  const user = { _id: "u-change-lock", password_hash: await bcrypt.hash("old-pass", 4) };
  for (let i = 0; i < 5; i++) {
    await assert.rejects(account.changePassword({ user, currentPassword: "nope", newPassword: "new-pass-123" }), { statusCode: 401 });
  }
  await assert.rejects(account.changePassword({ user, currentPassword: "old-pass", newPassword: "new-pass-123" }), { statusCode: 429 });
});

// ---------- quên / đặt lại mật khẩu ----------
const findOneReturning = (doc) => () => ({ select: async () => doc });

test("requestPasswordReset: email có thật -> token 64 hex, chỉ lưu SHA-256, hạn 30 phút", async () => {
  const now = new Date("2026-10-15T05:00:00Z");
  let update;
  const restore = patch(User, {
    findOne: findOneReturning({ _id: "u1", email: "a@b.vn", is_blocked: false, password_reset_requested_at: null }),
    updateOne: async (_f, u) => { update = u; return {}; },
  });
  try {
    const r = await account.requestPasswordReset({ email: " A@B.vn ", now });
    assert.match(r.token, /^[0-9a-f]{64}$/);
    assert.equal(update.$set.password_reset_token_hash, account.hashToken(r.token));
    assert.notEqual(update.$set.password_reset_token_hash, r.token);
    assert.equal(r.expiresAt.getTime() - now.getTime(), 30 * 60 * 1000);
  } finally { restore(); }
});

test("requestPasswordReset: email không có / bị khóa / vừa yêu cầu <60s -> null (không lộ gì)", async () => {
  const now = new Date("2026-10-15T05:00:00Z");
  for (const doc of [null, { _id: "u", is_blocked: true }, { _id: "u", is_blocked: false, password_reset_requested_at: new Date(now - 10_000) }]) {
    const restore = patch(User, { findOne: findOneReturning(doc), updateOne: async () => assert.fail("không được ghi") });
    try { assert.equal(await account.requestPasswordReset({ email: "x@y.vn", now }), null); } finally { restore(); }
  }
  assert.equal(await account.requestPasswordReset({ email: { $ne: "" } }), null);
});

test("resetPassword: token đúng + còn hạn -> đổi mật khẩu, xóa token (dùng 1 lần); token sai -> 400", async () => {
  const token = "a".repeat(64);
  let filter, update;
  let restore = patch(User, {
    findOneAndUpdate: async (f, u) => { filter = f; update = u; return { email: "a@b.vn" }; },
  });
  try {
    const now = new Date();
    await account.resetPassword({ token, newPassword: "brand-new-1", now });
    assert.equal(filter.password_reset_token_hash, account.hashToken(token));
    assert.deepEqual(filter.password_reset_expires, { $gt: now });
    assert.equal(update.$set.password_reset_token_hash, null);
    assert.ok(update.$set.password_changed_at instanceof Date);
  } finally { restore(); }

  restore = patch(User, { findOneAndUpdate: async () => null }); // không khớp / hết hạn / đã dùng
  try {
    await assert.rejects(account.resetPassword({ token, newPassword: "brand-new-1" }), { statusCode: 400 });
    await assert.rejects(account.resetPassword({ token: "not-a-token", newPassword: "brand-new-1" }), { statusCode: 400 });
    await assert.rejects(account.resetPassword({ token, newPassword: "123" }), { statusCode: 400 });
  } finally { restore(); }
});

test("phiên đăng nhập cấp TRƯỚC lần đổi mật khẩu -> hết hiệu lực", () => {
  const changedAt = new Date("2026-10-15T05:00:00Z");
  const user = { password_changed_at: changedAt };
  assert.equal(isSessionOlderThanPasswordChange({ user: { auth_at: changedAt.getTime() - 1 } }, user), true);
  assert.equal(isSessionOlderThanPasswordChange({ user: {} }, user), true); // phiên cũ chưa có auth_at
  assert.equal(isSessionOlderThanPasswordChange({ user: { auth_at: changedAt.getTime() + 1 } }, user), false);
  assert.equal(isSessionOlderThanPasswordChange({ user: {} }, { password_changed_at: null }), false);
});

// ---------- thông tin liên hệ ----------
test("normalizeContact: chuẩn hóa email/SĐT, từ chối sai định dạng", () => {
  assert.deepEqual(normalizeContact({ email: " Khach@Gmail.COM ", phone: "0912 345.678" }), { email: "khach@gmail.com", phone: "0912345678" });
  assert.equal(normalizePhone("+84 (912) 345-678"), "+84912345678");
  for (const bad of [null, {}, { email: "x", phone: "0912345678" }, { email: "a@b.vn", phone: "123" }, { email: "a@b.vn", phone: { $ne: "" } }]) {
    assert.throws(() => normalizeContact(bad), { statusCode: 400 });
  }
});

// ---------- nhật ký admin ----------
test("logAdminAction: ghi đúng admin/thao tác, rút gọn details, bỏ field nhạy cảm", async () => {
  let created;
  const restore = patch(AdminLog, { create: async (doc) => { created = doc; return doc; } });
  try {
    await logAdminAction(
      { _id: "admin1", email: "admin@example.com" },
      { action: "user.block", targetType: "user", targetId: { toString: () => "u9" }, summary: "Khóa tài khoản x", details: { password: "x", note: "lý do", list: [1, 2] } }
    );
    assert.equal(created.admin_email, "admin@example.com");
    assert.equal(created.target_id, "u9");
    assert.deepEqual(created.details, { note: "lý do", list: "[2 mục]" });
  } finally { restore(); }
});

test("logAdminAction: lỗi ghi DB KHÔNG làm hỏng thao tác chính", async () => {
  const restore = patch(AdminLog, { create: async () => { throw new Error("db down"); } });
  const origErr = console.error;
  console.error = () => {};
  try {
    await logAdminAction({ _id: "a", email: "a@b" }, { action: "flight.delete", targetType: "flight", summary: "x" });
  } finally { console.error = origErr; restore(); }
  assert.equal(compactDetails(null), null);
});
