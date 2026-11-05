import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";
import Aircraft from "@/models/Aircraft";
// Side-effect import — GET bên dưới populate("airline_id") nhưng model "Airline" chưa từng được require ở file…
import Airline from "@/models/Airline";
import { OWN_AIRLINE_CODE } from "@/config/constants";
import { logAdminAction } from "@/lib/adminLog";

export async function GET(request) {
  try {
    await dbConnect();
    await requireAdminUser(["flights", "flight_prices"]);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    const own = await Airline.findOne({ code: OWN_AIRLINE_CODE }).select("_id").lean();
    const flights = await Flight.find(own ? { airline_id: own._id } : { _id: null })
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
    const admin = await requireAdminUser("flights");

    const body = await request.json();
    const {
      flight_number,
      aircraft_id,
      origin_code,
      dest_code,
      departure_time,
      arrival_time,
      base_price,
    } = body ?? {};

    if (
      !flight_number ||
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
            "Thiếu trường bắt buộc: flight_number, aircraft_id, origin_code, dest_code, departure_time, arrival_time, base_price.economy.",
        },
        { status: 400 }
      );
    }

    if (String(origin_code).toUpperCase() === String(dest_code).toUpperCase()) {
      return NextResponse.json({ message: "Điểm đi và điểm đến không được trùng nhau." }, { status: 400 });
    }
    if (!(new Date(arrival_time) > new Date(departure_time))) {
      return NextResponse.json({ message: "Giờ đến phải sau giờ khởi hành." }, { status: 400 });
    }

    const aircraft = await Aircraft.findById(aircraft_id);
    if (!aircraft) {
      return NextResponse.json({ message: "Không tìm thấy aircraft_id tương ứng." }, { status: 404 });
    }

    // Website là kênh bán vé của một hãng: chuyến mới luôn thuộc hãng này, không nhận airline_id từ body.
    const airline = await Airline.findOne({ code: OWN_AIRLINE_CODE });
    if (!airline) {
      return NextResponse.json({ message: `Chưa có hãng ${OWN_AIRLINE_CODE} trong hệ thống.` }, { status: 409 });
    }

    // Ghế chỉ sinh từ sơ đồ của máy bay, không nhận seats[] từ body.
    const seats = aircraft.cloneSeatMapForFlight();

    const flight = await Flight.create({
      flight_number,
      airline_id: airline._id,
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
