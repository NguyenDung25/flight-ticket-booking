// cron/releaseExpiredHolds.js
//
// Chạy như 1 tiến trình Node RIÊNG, song song với `next dev`/`next start`:
//   node cron/releaseExpiredHolds.js
//
// Next.js không có sẵn tiến trình nền chạy liên tục — route trong app/api chỉ
// chạy khi có request tới, nên không dùng route để làm cron thật. Đây là lựa
// chọn (1) đã nêu trong README (đơn giản nhất cho đồ án demo local).

const mongoose = require("mongoose");
const cron = require("node-cron");
const { releaseExpiredHolds } = require("../services/seatService");
const { cancelExpiredPendingPayments } = require("../services/cancellationService");
const { CRON_SCHEDULE_EVERY_MINUTE } = require("../config/constants");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flight-ticket-booking";

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("[cron] Đã kết nối MongoDB, bắt đầu lịch quét ghế quá hạn mỗi phút.");

  // Chạy ngay 1 lần lúc khởi động, sau đó lặp lại mỗi phút.
  await runOnce();
  cron.schedule(CRON_SCHEDULE_EVERY_MINUTE, runOnce);
}

async function runOnce() {
  try {
    const { flightsMatched, flightsModified } = await releaseExpiredHolds();
    if (flightsModified > 0) {
      console.log(
        `[cron] Đã quét ${flightsMatched} chuyến bay có ghế quá hạn, cập nhật ${flightsModified} document.`
      );
    }

    // Việc 2 (ghi chú f) — độc lập với việc nhả ghế ở trên, xử lý booking
    // chưa từng thanh toán mà quá payment_expires_at.
    const cancelledCount = await cancelExpiredPendingPayments();
    if (cancelledCount > 0) {
      console.log(`[cron] Đã tự động hủy ${cancelledCount} booking quá hạn thanh toán.`);
    }
  } catch (err) {
    // Không throw ra ngoài — 1 lần chạy lỗi không được làm chết cả tiến trình cron.
    console.error("[cron] Lỗi khi nhả ghế quá hạn:", err);
  }
}

main().catch((err) => {
  console.error("[cron] Không kết nối được MongoDB, dừng tiến trình:", err);
  process.exit(1);
});
