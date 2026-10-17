import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Booking from "@/models/Booking";
// Side-effect import — populate({path:"flights.flight_id"}) bên dưới cần model "Flight" đã đăng ký.
import "@/models/Flight";

export async function GET() {
  try {
    await dbConnect();

    const session = await auth();
    const user = await requireActiveUser(session);

    const bookings = await Booking.find({ user_id: user._id })
      .sort({ created_at: -1 })
      .populate({
        path: "flights.flight_id",
        select: "flight_number origin_code dest_code departure_time arrival_time",
      });

    return NextResponse.json(bookings);
  } catch (err) {
    return handleApiError(err, "GET /api/bookings/my");
  }
}
