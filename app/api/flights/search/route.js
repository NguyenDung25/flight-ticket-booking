// app/api/flights/search/route.js
//
// C1 — tìm kiếm chuyến bay. KHÔNG cần đăng nhập (khách vãng lai xem được kết
// quả tìm kiếm bình thường — chỉ ĐẶT vé mới bắt buộc đăng nhập, đúng mục 1).
// Toàn bộ logic đã có sẵn ở services/flightService.js — route chỉ đọc query
// string, ép kiểu, và map lỗi.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { handleApiError } from "@/lib/apiError";
import { searchFlights } from "@/services/flightService";

export async function GET(request) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const origin = searchParams.get("origin")?.toUpperCase();
    const destination = searchParams.get("destination")?.toUpperCase();
    const departureDate = searchParams.get("departureDate");
    const tripType = searchParams.get("tripType") || "one_way";
    const returnDate = searchParams.get("returnDate") || undefined;
    const passengerCountRaw = searchParams.get("passengerCount");
    const passengerCount = passengerCountRaw ? Number(passengerCountRaw) : undefined;

    const result = await searchFlights({
      origin,
      destination,
      departureDate,
      tripType,
      returnDate,
      passengerCount,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "GET /api/flights/search");
  }
}
