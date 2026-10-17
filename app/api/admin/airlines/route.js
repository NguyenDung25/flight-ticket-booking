import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Airline from "@/models/Airline";
import { logAdminAction } from "@/lib/adminLog";

export async function GET() {
  try {
    await dbConnect();
    await requireAdminUser();

    const airlines = await Airline.find().sort({ code: 1 });
    return NextResponse.json(airlines);
  } catch (err) {
    return handleApiError(err, "GET /api/admin/airlines");
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();

    const body = await request.json();
    const { code, name } = body ?? {};

    if (!code || !name?.vi || !name?.en) {
      return NextResponse.json(
        { message: "code, name.vi, name.en đều là bắt buộc." },
        { status: 400 }
      );
    }

    const airline = await Airline.create({ code: code.toUpperCase(), name });
    await logAdminAction(admin, {
      action: "airline.create", targetType: "airline", targetId: airline._id,
      summary: `Thêm hãng bay ${airline.code}`,
    });
    return NextResponse.json(airline, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/airlines");
  }
}
