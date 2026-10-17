import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";
import Aircraft from "@/models/Aircraft";
// Side-effect import — GET bên dưới populate("airline_id") nhưng model "Airline" chưa từng được require ở file…
import "@/models/Airline";
import { logAdminAction } from "@/lib/adminLog";

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
    const admin = await requireAdminUser();

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

    // Ghế chỉ sinh từ sơ đồ của máy bay, không nhận seats[] từ body.
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

    await logAdminAction(admin, {
      action: "flight.create", targetType: "flight", targetId: flight._id,
      summary: `Tạo chuyến ${flight.flight_number} (${flight.origin_code} → ${flight.dest_code})`,
      details: { departure_time: flight.departure_time },
    });
    return NextResponse.json(flight, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/flights");
  }
}
