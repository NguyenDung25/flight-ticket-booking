// app/api/bookings/[id]/ticket/route.js
//
// C7 — xem lại vé điện tử. issueTicket() đã IDEMPOTENT theo booking_code
// (không sinh mã mới, không gửi lại email trừ khi resend=true tường minh)
// nên route này gọi thẳng lại mỗi lần khách mở trang xem vé, KHÔNG cần tự
// cache/kiểm tra "đã có mã chưa" ở đây — trùng logic, dễ lệch.
//
// issueTicket() KHÔNG tự kiểm tra "ai đang xem vé của ai" (đúng như pattern
// cancellationService/paymentService) — route PHẢI tự đối chiếu booking.user_id
// trước khi gọi.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Booking from "@/models/Booking";
import { issueTicket } from "@/services/ticketService";

export async function GET(request, { params }) {
  try {
    await dbConnect();

    const session = await auth();
    const user = await requireActiveUser(session);

    const { id } = await params;
    const existing = await Booking.findById(id);
    if (!existing) {
      return NextResponse.json({ message: "Không tìm thấy booking." }, { status: 404 });
    }
    if (String(existing.user_id) !== String(user._id)) {
      return NextResponse.json(
        { message: "Bạn không có quyền xem vé của booking này." },
        { status: 403 }
      );
    }

    // ?resend=true — khách bấm riêng nút "Gửi lại vé qua email" (xem comment
    // issueTicket: mặc định KHÔNG gửi lại mỗi lần chỉ mở trang xem vé).
    const resend = request.nextUrl.searchParams.get("resend") === "true";

    const { ticketData, emailSent } = await issueTicket({ bookingId: id, resend });

    return NextResponse.json({ ticket: ticketData, email_sent: emailSent });
  } catch (err) {
    return handleApiError(err, "GET /api/bookings/[id]/ticket");
  }
}
