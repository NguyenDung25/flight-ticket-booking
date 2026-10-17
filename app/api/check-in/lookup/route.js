import dbConnect from "@/lib/mongodb";
import { withCheckinGuard } from "@/lib/checkinGuard";
import { lookupForCheckIn } from "@/services/checkinService";

export async function POST(request) {
  return withCheckinGuard(request, "POST /api/check-in/lookup", async (body) => {
    await dbConnect();
    const items = await lookupForCheckIn({
      bookingCode: body.booking_code,
      passengerName: body.passenger_name,
    });
    return { items };
  });
}
