import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { releaseSeat } from "@/services/seatService";

export async function POST(request, { params }) {
  try {
    await dbConnect();

    const session = await auth();
    const user = await requireActiveUser(session);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { seat_number } = body ?? {};

    if (!seat_number) {
      return NextResponse.json(
        { message: "Thiếu seat_number." },
        { status: 400 }
      );
    }

    const flight = await releaseSeat({
      flightId: id,
      seatNumber: seat_number,
      userId: user._id,
    });

    // flight === null là no-op hợp lệ (ghế không held bởi user này nữa) — vẫn trả 200, không coi là lỗi.
    return NextResponse.json({
      flight_id: id,
      seat_number,
      released: flight !== null,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/flights/[id]/release-seat");
  }
}
