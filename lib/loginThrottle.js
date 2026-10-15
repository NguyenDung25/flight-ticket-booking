// lib/loginThrottle.js
//
// Giới hạn đăng nhập sai theo email: MAX_FAILURES lần sai trong WINDOW_MS thì khóa tạm LOCK_MS.
// Lưu trong bộ nhớ tiến trình (đủ cho đồ án chạy 1 instance); gắn vào globalThis vì Next.js có thể
// nạp module này nhiều lần ở các bundle khác nhau (dev/HMR). Chạy nhiều instance/serverless thì
// cần chuyển sang Redis hoặc 1 collection Mongo có TTL index.
//
// Đánh đổi: kẻ tấn công cố tình đăng nhập sai có thể khóa tạm tài khoản người khác (DoS nhẹ, tự
// hết sau LOCK_MS) — chấp nhận để đổi lấy chống dò mật khẩu.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_TRACKED_KEYS = 10000; // chặn rò rỉ bộ nhớ nếu bị spam nhiều email khác nhau

function store() {
  if (!globalThis.__loginThrottle) globalThis.__loginThrottle = new Map();
  return globalThis.__loginThrottle;
}

/** @returns {number} số ms còn bị khóa (0 nếu không bị khóa) */
function lockRemainingMs(key, now = Date.now()) {
  const entry = store().get(key);
  if (!entry || !entry.lockedUntil) return 0;
  if (entry.lockedUntil <= now) {
    store().delete(key);
    return 0;
  }
  return entry.lockedUntil - now;
}

function recordFailure(key, now = Date.now()) {
  const m = store();
  if (m.size >= MAX_TRACKED_KEYS && !m.has(key)) {
    // dọn các mục đã hết hạn; nếu vẫn đầy thì bỏ mục cũ nhất
    for (const [k, v] of m) {
      if ((v.lockedUntil ?? v.firstAt + WINDOW_MS) <= now) m.delete(k);
    }
    if (m.size >= MAX_TRACKED_KEYS) m.delete(m.keys().next().value);
  }
  let entry = m.get(key);
  if (!entry || (!entry.lockedUntil && now - entry.firstAt > WINDOW_MS)) {
    entry = { count: 0, firstAt: now, lockedUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + LOCK_MS;
  m.set(key, entry);
}

function reset(key) {
  store().delete(key);
}

module.exports = { MAX_FAILURES, WINDOW_MS, LOCK_MS, lockRemainingMs, recordFailure, reset };
