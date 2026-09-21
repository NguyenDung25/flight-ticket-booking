// lib/apiError.js
//
// Chuẩn hóa cách MỌI route trong app/api/ trả lỗi ra client — tránh lặp lại
// cùng 1 khối if/else ở hàng chục route khác nhau. Mọi route nên bọc logic
// chính trong try/catch, gọi handleApiError(err, "TÊN ROUTE") ở catch.
//
// Quy ước response lỗi: luôn { message: "..." } (khớp app/api/auth/register
// đã viết trước đó — dùng "message", KHÔNG dùng "error" làm key).

import { NextResponse } from "next/server";

export function handleApiError(err, context = "") {
  // Lỗi nghiệp vụ có sẵn statusCode (từ BẤT KỲ service nào: AuthError,
  // ActiveUserError, FlightError, ValidationError, PaymentError, TicketError,
  // CheckinError, CancellationError, PromotionError, StatsError...) — tin
  // tưởng message đã được service chọn lọc kỹ để an toàn hiển thị cho client.
  if (err && typeof err.statusCode === "number") {
    return NextResponse.json({ message: err.message }, { status: err.statusCode });
  }

  // Lỗi trùng unique index của Mongoose (VD Airline.code, Booking.booking_code
  // trùng) — map về 409 thay vì để lộ nguyên message kỹ thuật của MongoDB.
  if (err && err.code === 11000) {
    return NextResponse.json(
      { message: "Dữ liệu bị trùng (vi phạm ràng buộc duy nhất, VD mã đã tồn tại)." },
      { status: 409 }
    );
  }

  // Lỗi validate của chính Mongoose (VD thiếu field required, sai enum) —
  // thường do body client gửi lên sai cấu trúc cơ bản, hợp lý trả 400 kèm
  // message gốc (Mongoose tự liệt kê rõ field nào sai, không lộ thông tin
  // nhạy cảm gì thêm ngoài cấu trúc schema mà client vốn phải biết để gọi API).
  if (err && err.name === "ValidationError") {
    return NextResponse.json({ message: err.message }, { status: 400 });
  }

  // Lỗi hệ thống bất ngờ — log đầy đủ ở server, KHÔNG lộ chi tiết ra client.
  console.error(`[API ERROR]${context ? " " + context : ""}`, err);
  return NextResponse.json(
    { message: "Đã có lỗi xảy ra, vui lòng thử lại sau." },
    { status: 500 }
  );
}
