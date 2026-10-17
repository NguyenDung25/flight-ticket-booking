const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error(
    "Thiếu biến môi trường MONGO_URI — kiểm tra lại file .env.local."
  );
}

// `global` giữ nguyên giữa các lần hot-reload trong dev.
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
    // Cho phép lần gọi sau retry lại nếu connect thất bại (VD MongoDB chưa kịp khởi động khi `next dev` mới chạy).
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

module.exports = dbConnect;
