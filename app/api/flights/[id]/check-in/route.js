// app/api/flights/[id]/check-in/route.js
//
// C10 — bước cuối của check-in online: POST { seat_number, booking_code, passenger_name, ici_accepted }
// -> thẻ lên máy bay. KHÔNG cần đăng nhập (giống website hãng bay): xác thực bằng mã đặt chỗ + họ hành
// khách, bắt buộc ici_accepted === true (services/checkinService.js), chống dò mã bằng lib/checkinGuard.js. Toàn bộ rule ghi ghế (chuyến
// hủy, khung giờ 24h-2h, ghế phải 'booked', chặn check-in 2 lần) nằm ở seatService.checkInSeat().

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
