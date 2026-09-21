// app/api/flights/[id]/release-seat/route.js
//
// C4/C5 — nhả 1 ghế đang được CHÍNH user này giữ. Gọi khi khách bỏ chọn ghế,
// hoặc xóa 1 hành khách đã lỡ chọn ghế (side-effect bắt buộc — xem comment
// C4 trong chuc-nang-he-thong.md, KHÔNG được chỉ xóa state phía client).
//
// Ghế không còn `held` bởi đúng user này (đã hết hạn/không tồn tại) là
// no-op hợp lệ — seatService.releaseSeat trả về null, KHÔNG phải lỗi, vì
// mục tiêu cuối cùng (ghế không còn giữ bởi user) đã đạt được.

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

    // flight === null là no-op hợp lệ (ghế không held bởi user này nữa) —
    // vẫn trả 200, KHÔNG coi là lỗi (xem JSDoc seatService.releaseSeat).
    return NextResponse.json({
      flight_id: id,
      seat_number,
      released: flight !== null,
    });
  } catch (err) {
    return handleApiError(err, "POST /api/flights/[id]/release-seat");
  }
}
