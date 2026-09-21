// app/api/admin/aircraft/route.js
//
// A2 — CRUD máy bay. `seat_map_template` là NGUỒN DUY NHẤT sinh ghế khi tạo
// Flight (A1, ghi chú u) — admin nhập kỹ ở đây, KHÔNG có bước nhập ghế riêng
// lúc tạo chuyến bay.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Aircraft from "@/models/Aircraft";

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
    await requireAdminUser();

    const body = await request.json();
    const { name, total_seats, seat_map_template } = body ?? {};

    if (!name || !total_seats || !Array.isArray(seat_map_template)) {
      return NextResponse.json(
        { message: "name, total_seats, seat_map_template (mảng) đều là bắt buộc." },
        { status: 400 }
      );
    }

    // Cảnh báo SỚM nếu độ dài không khớp — schema KHÔNG tự validate việc này
    // (ghi chú trong models/Aircraft.js, cố tình để đồ án đơn giản), nhưng
    // route vẫn nên cảnh báo rõ ràng thay vì để admin tự phát hiện sau khi
    // tạo hàng loạt Flight với seat map sai.
    if (seat_map_template.length !== Number(total_seats)) {
      return NextResponse.json(
        {
          message: `seat_map_template có ${seat_map_template.length} ghế nhưng total_seats khai báo ${total_seats} — kiểm tra lại trước khi lưu.`,
        },
        { status: 400 }
      );
    }

    const aircraft = await Aircraft.create({ name, total_seats, seat_map_template });
    return NextResponse.json(aircraft, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/aircraft");
  }
}
