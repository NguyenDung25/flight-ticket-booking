// app/api/admin/flights/[id]/cancel-bulk/route.js
//
// A8 — hủy chuyến bay THẬT SỰ do lỗi hãng (khác PATCH /api/admin/flights/[id]
// ở chỗ route đó CHỈ đổi field status đơn thuần, KHÔNG đụng Booking nào —
// xem comment trong file đó). Route này làm CẢ 2 việc trong 1 request:
// 1. Đổi Flight.status -> "cancelled".
// 2. Cascade cancellationService.cancelBookingsForFlight() — hủy/hoàn tiền
//    TOÀN BỘ booking đang pending_payment/confirmed gắn với chuyến này.
//
// KHÔNG dùng transaction MongoDB thật (đúng comment mục 10 statsService.js —
// dự án không dùng Transaction) — nếu bước 2 lỗi giữa chừng sau khi bước 1
// đã lưu, Flight vẫn đúng "cancelled" (sự thật), chỉ có 1 số Booking chưa
// kịp xử lý — an toàn để CHẠY LẠI route này (cancelBookingsForFlight tự lọc
// đúng status pending_payment/confirmed còn sót, không xử lý trùng booking
// đã refunded/cancelled từ lần chạy trước).

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { ActiveUserError } from "@/lib/requireActiveUser";
import Flight from "@/models/Flight";
import { cancelBookingsForFlight } from "@/services/cancellationService";

export async function POST(request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      throw new ActiveUserError("Cần nêu rõ lý do hủy chuyến bay (A8).", 400);
    }

    const flight = await Flight.findById(id);
    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    if (flight.status === "cancelled") {
      return NextResponse.json(
        { message: "Chuyến bay này đã ở trạng thái hủy từ trước." },
        { status: 409 }
      );
    }

    flight.status = "cancelled";
    await flight.save();

    const affectedBookingIds = await cancelBookingsForFlight({
      flightId: id,
      cancelReason: `[Hủy chuyến A8] ${reason}`,
    });

    return NextResponse.json({
      flight_id: id,
      affected_booking_count: affectedBookingIds.length,
      affected_booking_ids: affectedBookingIds,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/flights/[id]/cancel-bulk");
  }
}
