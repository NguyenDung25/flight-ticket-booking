import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Airport from "@/models/Airport";

export async function GET() {
  await dbConnect();

  const airports = await Airport.find({}, "code name city country")
    .sort({ city: 1 })
    .lean();

  return NextResponse.json({ airports });
}
