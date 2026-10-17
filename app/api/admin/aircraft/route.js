import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Aircraft from "@/models/Aircraft";
import { assertValidSeatMapTemplate } from "@/lib/seatMapValidation";
import { logAdminAction } from "@/lib/adminLog";

export async function GET() {
  try {
    await dbConnect();
    await requireAdminUser();

    const aircraft = await Aircraft.find().sort({ name: 1 });
    return NextResponse.json(aircraft);
  } catch (err) {
    return handleApiError(err, "GET /api/admin/aircraft");
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();

    const body = await request.json();
    const { name, total_seats, seat_map_template } = body ?? {};

    if (!name || !total_seats || !Array.isArray(seat_map_template)) {
      return NextResponse.json(
        { message: "name, total_seats, seat_map_template (mảng) đều là bắt buộc." },
        { status: 400 }
      );
    }

    // Cảnh báo sớm nếu độ dài không khớp — schema không tự validate việc này.
    if (seat_map_template.length !== Number(total_seats)) {
      return NextResponse.json(
        {
          message: `seat_map_template có ${seat_map_template.length} ghế nhưng total_seats khai báo ${total_seats} — kiểm tra lại trước khi lưu.`,
        },
        { status: 400 }
      );
    }

    assertValidSeatMapTemplate(seat_map_template);
    const aircraft = await Aircraft.create({ name, total_seats, seat_map_template });
    await logAdminAction(admin, {
      action: "aircraft.create", targetType: "aircraft", targetId: aircraft._id,
      summary: `Thêm máy bay ${aircraft.name} (${aircraft.total_seats} ghế)`,
    });
    return NextResponse.json(aircraft, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/aircraft");
  }
}
