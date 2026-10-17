import dbConnect from "@/lib/mongodb";
import { withCheckinGuard } from "@/lib/checkinGuard";
import { checkIn } from "@/services/checkinService";

export async function POST(request, { params }) {
  return withCheckinGuard(request, "POST /api/flights/[id]/check-in", async (body) => {
    await dbConnect();
    const { id } = await params;
    return checkIn({
      flightId: id,
      seatNumber: body.seat_number,
      bookingCode: body.booking_code,
      passengerName: body.passenger_name,
      iciAccepted: body.ici_accepted,
    });
  });
}
