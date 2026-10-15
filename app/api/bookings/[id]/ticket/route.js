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

const RESEND_COOLDOWN_MS = 60 * 1000;

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

    // Chống bấm/gọi liên tục để "bắn" email: mỗi booking chỉ được gửi lại sau RESEND_COOLDOWN_MS.
    // Lưu trong bộ nhớ tiến trình (globalThis vì Next có thể nạp module nhiều lần).
    if (resend) {
      const m = (globalThis.__ticketResendAt ??= new Map());
      const last = m.get(id) ?? 0;
      const wait = RESEND_COOLDOWN_MS - (Date.now() - last);
      if (wait > 0) {
        return NextResponse.json(
          { message: `Vui lòng đợi ${Math.ceil(wait / 1000)} giây trước khi gửi lại email vé.` },
          { status: 429 }
        );
      }
      m.set(id, Date.now());
      if (m.size > 5000) m.delete(m.keys().next().value);
    }

    const { ticketData, emailSent } = await issueTicket({ bookingId: id, resend });

    return NextResponse.json({ ticket: ticketData, email_sent: emailSent });
  } catch (err) {
    return handleApiError(err, "GET /api/bookings/[id]/ticket");
  }
}
