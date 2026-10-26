import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { normalizeAircraftCode, getCachedAircraft, setCachedAircraft } from "@/lib/airlabsSchedules";

// API lịch bay (/schedules) không trả loại máy bay; API thông tin chuyến bay (/flight) thì có (aircraft_icao).
const AIRLABS_FLIGHT_URL = "https://airlabs.co/api/v9/flight";
const FLIGHT_IATA = /^[A-Z0-9]{2}\d{1,4}$/;

export async function GET(request) {
  try {
    await requireAdminUser();

    const apiKey = process.env.AIRLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ message: "Chưa cấu hình AIRLABS_API_KEY trong .env.local." }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const flightIata = (searchParams.get("flight_iata") || "").toUpperCase();
    if (!FLIGHT_IATA.test(flightIata)) {
      return NextResponse.json({ message: "Số hiệu chuyến bay không hợp lệ." }, { status: 400 });
    }

    const cached = getCachedAircraft(flightIata);
    if (cached !== undefined) {
      return NextResponse.json({ aircraft_icao: cached, cached: true });
    }

    const url = `${AIRLABS_FLIGHT_URL}?flight_iata=${flightIata}&api_key=${encodeURIComponent(apiKey)}`;
    let payload;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      payload = await res.json();
    } catch {
      return NextResponse.json({ message: "Không kết nối được AirLabs để lấy loại máy bay." }, { status: 502 });
    }

    if (payload?.error) {
      console.error("[AirLabs flight]", payload.error);
      return NextResponse.json({ message: "AirLabs không trả được loại máy bay của chuyến này." }, { status: 502 });
    }

    // Chuyến chưa từng được AirLabs ghi nhận -> null (không phải lỗi), vẫn lưu để không gọi lại.
    const code = normalizeAircraftCode(payload?.response?.aircraft_icao);
    setCachedAircraft(flightIata, code);
    return NextResponse.json({ aircraft_icao: code, cached: false });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/airlabs/flight");
  }
}
