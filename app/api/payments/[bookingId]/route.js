// app/api/payments/[bookingId]/route.js
//
// C6 — MỘT route POST duy nhất phục vụ CẢ 2 luồng của services/paymentService.js
// (xem comment đầu file đó), vì Momo IPN cũng POST tới đúng URL này
// (`ipnUrl = ${baseUrl}/api/payments/${bookingId}`, xây trong initiatePayment):
//
// 1) Khách bấm "Thanh toán" trên UI của mình → body KHÔNG có `signature` →
//    cần đăng nhập, chỉ chủ booking mới gọi được → initiatePayment(). Thanh
//    toán bằng thẻ ATM nội địa qua cổng Momo (payWithATM); body có thể kèm
//    `method: "momo_atm"` (giá trị duy nhất hiện được hỗ trợ, cũng là mặc định).
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

/**
 * Origin công khai của app, dùng để dựng redirectUrl/ipnUrl gửi cho Momo.
 *
 * `request.nextUrl.origin` KHÔNG đáng tin khi chạy sau proxy/tunnel (ngrok):
 * trong `next dev` nó có thể vẫn là http://localhost:3000 dù khách đang mở web
 * qua https://xxxx.ngrok-free.app -> Momo nhận ipnUrl là localhost, không gọi
 * ngược được, booking kẹt ở pending_payment. Thứ tự ưu tiên:
 *   1. APP_BASE_URL (.env.local) — chắc chắn nhất, nên dùng khi demo/deploy.
 *   2. Header x-forwarded-host / x-forwarded-proto (ngrok, reverse proxy).
 *   3. request.nextUrl.origin (chạy thuần localhost).
 */
function resolveBaseUrl(request) {
  const fromEnv = process.env.APP_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
    return `${proto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

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

    // `method` không bắt buộc: không gửi -> mặc định "momo_atm". Giá trị khác
    // (VD "momo" cũ) bị initiatePayment từ chối với 400.
    const result = await initiatePayment({
      bookingId,
      baseUrl: resolveBaseUrl(request),
      locale: user.preferred_language,
      ...(body?.method !== undefined && { paymentMethod: body.method }),
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "POST /api/payments/[bookingId]");
  }
}
