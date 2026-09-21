// app/api/admin/flights/route.js
//
// A1 — tạo chuyến bay mới. `seats[]` KHÔNG nhận từ client — luôn sinh từ
// `Aircraft.cloneSeatMapForFlight()` (ghi chú u, models/Aircraft.js) để đảm
// bảo mỗi Flight có bản ghế độc lập, đúng nguồn duy nhất là seat_map_template.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";
import Aircraft from "@/models/Aircraft";

export async function GET(request) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    const flights = await Flight.find()
      .sort({ departure_time: -1 })
      .limit(limit)
      .populate("airline_id", "code name")
      .populate("aircraft_id", "name");

    return NextResponse.json(flights);
  } catch (err) {
    return handleApiError(err, "GET /api/admin/flights");
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    await requireAdminUser();

    const body = await request.json();
    const {
      flight_number,
      airline_id,
      aircraft_id,
      origin_code,
      dest_code,
      departure_time,
      arrival_time,
      base_price,
    } = body ?? {};

    if (
      !flight_number ||
      !airline_id ||
      !aircraft_id ||
      !origin_code ||
      !dest_code ||
      !departure_time ||
      !arrival_time ||
      !base_price?.economy
    ) {
      return NextResponse.json(
        {
          message:
            "Thiếu trường bắt buộc: flight_number, airline_id, aircraft_id, origin_code, dest_code, departure_time, arrival_time, base_price.economy.",
        },
        { status: 400 }
      );
    }

    const aircraft = await Aircraft.findById(aircraft_id);
    if (!aircraft) {
      return NextResponse.json({ message: "Không tìm thấy aircraft_id tương ứng." }, { status: 404 });
    }

    // Nguồn ghế DUY NHẤT — xem ghi chú đầu file, KHÔNG nhận seats[] từ body
    // dù client có cố tình gửi lên.
    const seats = aircraft.cloneSeatMapForFlight();

    const flight = await Flight.create({
      flight_number,
      airline_id,
      aircraft_id,
      origin_code: origin_code.toUpperCase(),
      dest_code: dest_code.toUpperCase(),
      departure_time,
      arrival_time,
      base_price,
      seats,
    });

    return NextResponse.json(flight, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/flights");
  }
}
