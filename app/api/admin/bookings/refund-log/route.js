// app/api/admin/bookings/refund-log/route.js
//
// A7 — nhật ký đối soát hoàn tiền, CHỈ ĐỌC (không có POST/PATCH/DELETE: đây không còn là
// hàng đợi duyệt). Trả các booking đã `refunded` kèm số tiền hoàn, mức phạt đã áp, lý do
// khách nhập, thời điểm xử lý. Thêm ?include_errors=1 để lấy luôn các booking
// `payment_error_manual_refund` đang chờ admin hoàn tay.
//
// Trang quản trị /admin/refunds đọc DB trực tiếp (convention của các page.js); route này
// phục vụ đúng đặc tả API và cho tích hợp/kiểm thử bên ngoài.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Booking from "@/models/Booking";
import "@/models/User";

export async function GET(request) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { searchParams } = new URL(request.url);
    const includeErrors = searchParams.get("include_errors") === "1";
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

    const statuses = includeErrors ? ["refunded", "payment_error_manual_refund"] : ["refunded"];

    const bookings = await Booking.find(
      { status: { $in: statuses } },
      "booking_code user_id status total_amount refund_amount cancellation_fee_amount cancellation_tier cancel_reason refund_processed_at"
    )
      .populate("user_id", "email full_name")
      .sort({ refund_processed_at: -1, created_at: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      refunds: bookings.map((b) => ({
        booking_id: String(b._id),
        booking_code: b.booking_code ?? null,
        customer: b.user_id ? { email: b.user_id.email, full_name: b.user_id.full_name } : null,
        status: b.status,
        total_amount: b.total_amount,
        refund_amount: b.refund_amount ?? null,
        cancellation_fee_amount: b.cancellation_fee_amount ?? null,
        cancellation_tier: b.cancellation_tier ?? null,
        cancel_reason: b.cancel_reason ?? null,
        refund_processed_at: b.refund_processed_at ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/bookings/refund-log");
  }
}
