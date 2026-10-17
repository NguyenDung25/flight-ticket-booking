import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { ActiveUserError } from "@/lib/requireActiveUser";
import Flight from "@/models/Flight";
import { cancelBookingsForFlight } from "@/services/cancellationService";
import { logAdminAction } from "@/lib/adminLog";

export async function POST(request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();

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
    // Không chặn khi chuyến đã "cancelled": cho phép chạy lại để xử lý nốt booking còn sót.
    if (flight.status !== "cancelled") {
      flight.status = "cancelled";
      await flight.save();
    }

    const affectedBookingIds = await cancelBookingsForFlight({
      flightId: id,
      cancelReason: `[Hủy chuyến A8] ${reason}`,
    });

    await logAdminAction(admin, {
      action: "flight.cancel_bulk", targetType: "flight", targetId: id,
      summary: `Hủy chuyến ${flight.flight_number} và xử lý ${affectedBookingIds.length} booking liên quan`,
      details: { reason, affected_booking_count: affectedBookingIds.length },
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
