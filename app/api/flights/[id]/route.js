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

    const flight = (await getFlightDetail(id)).toObject();
    // API công khai (không cần đăng nhập): khách chỉ cần seat_number/status/
    // seat_class để vẽ sơ đồ ghế. held_by (userId người đang giữ),
    // boarding_pass_code (mã lên máy bay) và trạng thái check-in của người
    // khác KHÔNG được lộ ra ngoài.
    flight.seats = flight.seats.map((seat) => {
      const {
        held_by: _heldBy,
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
