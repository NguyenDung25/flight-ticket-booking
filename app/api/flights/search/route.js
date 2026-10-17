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
