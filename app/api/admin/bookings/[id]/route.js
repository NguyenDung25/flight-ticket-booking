// app/api/admin/bookings/[id]/route.js
//
// A3 — PATCH xử lý tay booking `payment_error_manual_refund` (ngoại lệ DUY NHẤT cho
// phép admin nhập tay refund_amount — xem ghi chú y và mô tả A3).
//
// Body: { refund_amount: number (đồng, nguyên dương, <= total_amount), note?: string }
//
// KHÔNG dùng route này để đổi status booking khác: muốn hủy booking đã `confirmed`,
// admin gọi PATCH /api/bookings/[id]/cancel như khách (C9) để hệ thống tự tính mốc phạt.
// Service tự từ chối (409) nếu booking không ở đúng trạng thái lỗi thanh toán.

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { ActiveUserError } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { resolveManualRefund } from "@/services/cancellationService";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();
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
