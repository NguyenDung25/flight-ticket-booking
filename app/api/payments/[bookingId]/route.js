// app/api/payments/[bookingId]/route.js
//
// C6 — khách bấm "Thanh toán": cần đăng nhập, chỉ chủ booking mới gọi được →
// paymentService.initiatePayment() trả về payUrl của VNPay để FE redirect.
//
// IPN của VNPay KHÔNG tới đây — VNPay gọi GET /api/payments/vnpay-ipn (URL cấu
// hình cố định ở trang quản trị merchant, xem app/api/payments/vnpay-ipn/route.js).

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Booking from "@/models/Booking";
import { initiatePayment } from "@/services/paymentService";
import { ipForGateway } from "@/lib/clientIp";

export async function POST(request, { params }) {
  const { bookingId } = await params;

  try {
    await dbConnect();

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
      ipAddr: ipForGateway(request.headers),
      locale: user.preferred_language,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "POST /api/payments/[bookingId]");
  }
}
