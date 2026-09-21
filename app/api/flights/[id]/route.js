// app/api/flights/[id]/route.js
//
// C3 — chi tiết 1 chuyến bay (kèm seats[] đầy đủ, phục vụ luôn C4/C5 chọn
// ghế trên CÙNG màn hình — xem comment trong flightService.getFlightDetail).
// KHÔNG cần đăng nhập để XEM — chỉ hold-seat/tạo booking mới cần.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { handleApiError } from "@/lib/apiError";
import { getFlightDetail } from "@/services/flightService";

export async function GET(_request, { params }) {
  try {
    await dbConnect();
    const { id } = await params;

    const flight = await getFlightDetail(id);
    return NextResponse.json(flight);
  } catch (err) {
    return handleApiError(err, "GET /api/flights/[id]");
  }
}
