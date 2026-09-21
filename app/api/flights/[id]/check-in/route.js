// app/api/flights/[id]/check-in/route.js
//
// C10 — check-in online. Toàn bộ rule nghiệp vụ (khung giờ 24h-2h, đúng chủ
// ghế, ghế phải đang 'booked', chặn check-in 2 lần) nằm ở
// services/seatService.checkInSeat(), được services/checkinService.checkIn()
// gọi kèm bước đối chiếu Booking để lấy locale + tên hành khách cho boarding
// pass. Route này chỉ lo auth + đọc body + map lỗi.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { checkIn } from "@/services/checkinService";

export async function POST(request, { params }) {
  try {
    await dbConnect();

    const session = await auth();
    const user = await requireActiveUser(session);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { seat_number } = body ?? {};

    if (!seat_number) {
      return NextResponse.json({ message: "Thiếu seat_number." }, { status: 400 });
    }

    const boardingPass = await checkIn({
      flightId: id,
      seatNumber: seat_number,
      userId: user._id,
    });

    return NextResponse.json(boardingPass);
  } catch (err) {
    return handleApiError(err, "POST /api/flights/[id]/check-in");
  }
}
