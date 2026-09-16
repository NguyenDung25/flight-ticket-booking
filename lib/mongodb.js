// lib/mongodb.js
//
// Next.js App Router chạy mỗi API route trong 1 lần gọi module riêng, và
// dev-mode hot-reload sẽ require lại module này liên tục — nếu gọi thẳng
// `mongoose.connect()` mỗi lần thì sẽ mở rất nhiều connection dư thừa.
// Cache connection vào `global` (sống sót qua hot-reload) để chỉ connect
// đúng 1 lần, giống pattern chính thức Next.js khuyến nghị cho Mongoose.
//
// Dùng ở: mọi API route (`app/api/**/route.js`) và `auth.js` (CredentialsProvider
// gọi `authService.verifyCredentials()`, mà service này cần DB đã kết nối).
// KHÔNG dùng file này trong `cron/releaseExpiredHolds.js` — cron là tiến
// trình Node riêng, tự `mongoose.connect()` lúc khởi động (xem file đó).

const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error(
    "Thiếu biến môi trường MONGO_URI — kiểm tra lại file .env.local."
  );
}

// `global` giữ nguyên giữa các lần hot-reload trong dev (không giữ nguyên
// giữa các lần deploy/serverless cold start, nhưng đồ án chạy `next start`
// 1 tiến trình dài nên không phải vấn đề).
let cached = global._mongooseConn;
if (!cached) {
  cached = global._mongooseConn = { conn: null, promise: null };
}

async function dbConnect() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGO_URI, { bufferCommands: false })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Cho phép lần gọi sau retry lại nếu connect thất bại (VD MongoDB
    // chưa kịp khởi động khi `next dev` mới chạy), không cache lỗi mãi mãi.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

module.exports = dbConnect;
