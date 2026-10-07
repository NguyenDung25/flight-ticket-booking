// app/api/payments/[bookingId]/route.js
//
// C6 — MỘT route POST duy nhất phục vụ CẢ 2 luồng của services/paymentService.js
// (xem comment đầu file đó), vì Momo IPN cũng POST tới đúng URL này
// (`ipnUrl = ${baseUrl}/api/payments/${bookingId}`, xây trong initiatePayment):
//
// 1) Khách bấm "Thanh toán" trên UI của mình → body KHÔNG có `signature` →
//    cần đăng nhập, chỉ chủ booking mới gọi được → initiatePayment().
// 2) Momo gọi ngầm (IPN) sau khi khách thanh toán xong bên app Momo → body
//    LUÔN có `signature` (Momo tự ký, xem lib/momoClient.buildIpnRawSignature)
//    → KHÔNG có session (Momo gọi server-to-server) → verify chữ ký ngay
//    trong paymentService.handleWebhook(), KHÔNG qua requireActiveUser.
//
// Phân biệt 2 nhánh bằng sự có mặt của `signature` trong body — đơn giản và
// an toàn vì nhánh (1) không bao giờ tự gửi field này lên.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Booking from "@/models/Booking";
import { initiatePayment, handleWebhook } from "@/services/paymentService";

export async function POST(request, { params }) {
  const { bookingId } = await params;

  try {
    await dbConnect();

    const body = await request.json().catch(() => ({}));

    // --- Nhánh 2: Momo IPN webhook ---
    if (body && typeof body.signature === "string") {
      await handleWebhook(body);
      // Momo chỉ cần biết server đã nhận — trả 200 + resultCode 0 theo đúng
      // định dạng ack Momo mong đợi cho IPN, KHÔNG trả nguyên Booking doc.
      return NextResponse.json({ resultCode: 0, message: "Đã nhận." });
    }

    // --- Nhánh 1: khách bấm "Thanh toán" ---
    const session = await auth();
    const user = await requireActiveUser(session);

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return NextResponse.json({ message: "Không tìm thấy booking." }, { status: 404 });
    }
    if (String(booking.user_id) !== String(user._id)) {
      // Không tiết lộ booking có tồn tại hay không cho người không sở hữu —
      // 403 kèm message chung, khớp mức độ chi tiết các route khác đang dùng.
      return NextResponse.json(
        { message: "Bạn không có quyền thanh toán booking này." },
        { status: 403 }
      );
    }

    const result = await initiatePayment({
      bookingId,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin,
      locale: user.preferred_language,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "POST /api/payments/[bookingId]");
  }
}
