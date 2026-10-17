import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { ActiveUserError } from "@/lib/requireActiveUser";
import Booking from "@/models/Booking";
import { cancelBooking } from "@/services/cancellationService";
import { logAdminAction } from "@/lib/adminLog";

const DEFAULT_CANCEL_REASON = "Khách tự hủy vé.";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();

    const session = await auth();
    const user = await requireActiveUser(session);

    const { id } = await params;
    const existing = await Booking.findById(id);
    if (!existing) {
      return NextResponse.json({ message: "Không tìm thấy booking." }, { status: 404 });
    }

    const isOwner = String(existing.user_id) === String(user._id);
    const isAdmin = user.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { message: "Bạn không có quyền hủy booking này." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawReason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    let cancelReason;
    if (isOwner) {
      cancelReason = rawReason || DEFAULT_CANCEL_REASON;
    } else {
      // A3 — admin hủy thay mặt khách khác: không có default, bắt buộc nêu lý do.
      if (!rawReason) {
        throw new ActiveUserError("Cần nêu rõ lý do khi hủy vé thay mặt khách (A3).", 400);
      }
      cancelReason = `[Admin hủy thay] ${rawReason}`;
    }

    const booking = await cancelBooking({ bookingId: id, cancelReason });

    // Admin hủy thay khách (A3) -> ghi nhật ký thao tác admin.
    if (!isOwner) {
      await logAdminAction(user, {
        action: "booking.cancel", targetType: "booking", targetId: id,
        summary: `Hủy vé thay khách, booking ${booking.booking_code || id}`,
        details: { reason: rawReason, status: booking.status, refund_amount: booking.refund_amount },
      });
    }

    return NextResponse.json(booking);
  } catch (err) {
    return handleApiError(err, "PATCH /api/bookings/[id]/cancel");
  }
}
