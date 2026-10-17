import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import { handleApiError } from "@/lib/apiError";
import { holdSeat } from "@/services/seatService";

export async function POST(request, { params }) {
  try {
    await dbConnect();

    const session = await auth();
    const user = requireVerifiedEmail(await requireActiveUser(session));

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { seat_number } = body ?? {};

    if (!seat_number) {
      return NextResponse.json(
        { message: "Thiếu seat_number." },
        { status: 400 }
      );
    }

    const flight = await holdSeat({
      flightId: id,
      seatNumber: seat_number,
      userId: user._id,
    });

    const heldSeat = flight.seats.find((s) => s.seat_number === seat_number);

    return NextResponse.json({
      flight_id: flight._id,
      seat_number: heldSeat.seat_number,
      seat_class: heldSeat.seat_class,
      status: heldSeat.status,
      held_until: heldSeat.held_until,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/flights/[id]/hold-seat");
  }
}
