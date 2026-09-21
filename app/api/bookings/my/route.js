// app/api/bookings/my/route.js
//
// C9 — danh sách vé của khách hiện tại. Sort theo created_at giảm dần, KHỚP
// ĐÚNG compound index { user_id: 1, created_at: -1 } đã có sẵn trên
// models/Booking.js (mục 8) — không tự đổi thứ tự sort nếu không có lý do,
// nếu không sẽ không tận dụng được index đó.
//
// Populate "flights.flight_id" để trang danh sách hiển thị được tuyến bay/
// giờ bay mà không cần round-trip riêng lấy Flight cho từng booking.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Booking from "@/models/Booking";

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
