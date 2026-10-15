// app/api/check-in/lookup/route.js
//
// C10 — bước 1 của check-in online: POST { booking_code, passenger_name } -> danh sách ghế của booking
// (trạng thái khung giờ, đã check-in chưa, thẻ lên máy bay nếu có). Không cần đăng nhập; chống dò
// mã bằng lib/checkinGuard.js. Dùng POST (không phải GET ?name=...) để họ tên không nằm trên URL/log.

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
