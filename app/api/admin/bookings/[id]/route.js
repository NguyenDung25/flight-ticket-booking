import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { ActiveUserError } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { resolveManualRefund } from "@/services/cancellationService";
import { logAdminAction } from "@/lib/adminLog";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      throw new ActiveUserError("ID booking không hợp lệ.", 400);
    }

    const body = await request.json().catch(() => null);
    if (!body || body.refund_amount === undefined) {
      throw new ActiveUserError("Body phải có field refund_amount.", 400);
    }

    const booking = await resolveManualRefund({
      bookingId: id,
      refundAmount: body.refund_amount,
      note: body.note,
    });

    await logAdminAction(admin, {
      action: "booking.manual_refund", targetType: "booking", targetId: id,
      summary: `Hoàn tiền tay ${Number(booking.refund_amount).toLocaleString("vi-VN")}đ cho booking ${booking.booking_code || id}`,
      details: { refund_amount: booking.refund_amount, fee: booking.cancellation_fee_amount, note: body.note ?? null },
    });
    return NextResponse.json({
      booking: {
        id: String(booking._id),
        status: booking.status,
        refund_amount: booking.refund_amount,
        cancellation_fee_amount: booking.cancellation_fee_amount,
        cancellation_tier: booking.cancellation_tier,
        refund_processed_at: booking.refund_processed_at,
      },
    });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/bookings/[id]");
  }
}
