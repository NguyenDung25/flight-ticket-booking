import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { handleApiError } from "@/lib/apiError";
import { getFlightDetail } from "@/services/flightService";

export async function GET(_request, { params }) {
  try {
    await dbConnect();
    const { id } = await params;

    const flight = (await getFlightDetail(id)).toObject();
    // API công khai (không cần đăng nhập): khách chỉ cần seat_number/status/ seat_class để vẽ sơ đồ ghế.
    flight.seats = flight.seats.map((seat) => {
      const {
        held_by: _heldBy,
        held_until: _heldUntil,
        boarding_pass_code: _boardingPassCode,
        checked_in: _checkedIn,
        checked_in_at: _checkedInAt,
        ...publicSeat
      } = seat;
      return publicSeat;
    });
    return NextResponse.json(flight);
  } catch (err) {
    return handleApiError(err, "GET /api/flights/[id]");
  }
}
