// CHỈ DÙNG ĐỂ TEST (khi sandbox VNPay lỗi): đặt 1 booking đang `pending_payment` sang `confirmed`
// đúng theo luồng "thanh toán thành công" của hệ thống (ghế held -> booked, ghi giao dịch giả,
// sinh booking_code, thử gửi email vé) nhưng KHÔNG qua VNPay.
//
// Cách chạy (PowerShell, tại thư mục dự án):
//   node --env-file=.env.local scripts/confirmTestBooking.js <bookingId>
//   node --env-file=.env.local scripts/confirmTestBooking.js --latest
//
// Điều kiện: booking còn `pending_payment` và ghế còn đang giữ (chưa quá hạn).
// Báo cáo phải ghi rõ: dữ liệu này đặt tay, KHÔNG phải thanh toán VNPay thật.
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const seatService = require("../services/seatService");
const ticketService = require("../services/ticketService");

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Từ chối chạy ở production.");
  }
  const arg = process.argv[2];
  if (!arg) throw new Error("Thiếu tham số: <bookingId> hoặc --latest");
  if (!process.env.MONGO_URI) throw new Error("Thiếu MONGO_URI (chạy với --env-file=.env.local)");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Đã kết nối:", mongoose.connection.name);

  const booking =
    arg === "--latest"
      ? await Booking.findOne({ status: "pending_payment" }).sort({ created_at: -1 })
      : await Booking.findById(arg);
  if (!booking) throw new Error("Không tìm thấy booking (pending_payment).");
  if (booking.status !== "pending_payment") {
    throw new Error(`Booking đang ở '${booking.status}', chỉ xử lý được 'pending_payment'.`);
  }

  const seatRefs = [];
  for (const p of booking.passengers || []) {
    for (const s of p.seats || []) {
      seatRefs.push({ flightId: s.flight_id, seatNumber: s.seat_number });
    }
  }
  if (!seatRefs.length) throw new Error("Booking không có ghế nào.");

  const { failedSeats } = await seatService.confirmAllSeatsBooked({
    seatRefs,
    userId: booking.user_id,
  });
  if (failedSeats.length) {
    throw new Error(
      `Không xác nhận được ghế ${failedSeats.map((f) => f.seatNumber).join(", ")} ` +
        "(có thể đã hết hạn giữ). Hãy tạo booking mới rồi chạy lại ngay."
    );
  }

  const won = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending_payment" },
    {
      $set: {
        status: "confirmed",
        "payment.method": booking.payment?.method || "vnpay",
        "payment.transaction_id": "TEST" + Date.now(),
        "payment.paid_at": new Date(),
      },
    },
    { returnDocument: "after" }
  );
  if (!won) throw new Error("Booking vừa đổi trạng thái ở nơi khác, hãy thử lại.");

  const { booking: done, emailSent } = await ticketService.issueTicket({
    bookingId: String(won._id),
  });
  console.log("XONG:", {
    booking_id: String(done._id),
    booking_code: done.booking_code,
    status: done.status,
    so_ghe: seatRefs.length,
    email_da_gui: emailSent,
  });
  console.log("Vào 'Vé của tôi' trên web để thử hủy vé / check-in.");
}

main()
  .catch((e) => {
    console.error("LỖI:", e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
