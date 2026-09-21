// app/api/admin/flights/[id]/route.js
//
// A1 — xem/sửa 1 chuyến bay. PATCH CHỈ cho sửa field không ảnh hưởng cấu
// trúc ghế đã sinh (giờ bay, giá, status) — `aircraft_id` KHÔNG được sửa sau
// khi tạo (đúng comment trong models/Flight.js: sửa aircraft_id sẽ làm lệch
// hẳn seats[] đã sinh, không có cơ chế re-sync).
//
// Hủy chuyến bay THẬT SỰ (kèm cascade hủy toàn bộ booking liên quan, A8) là
// 1 hành động RIÊNG, có route riêng (POST .../cancel-bulk, làm ở Giai đoạn
// 5) — route PATCH này CHỈ đổi field `status` đơn thuần trên chính Flight,
// KHÔNG tự động đụng tới Booking nào.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";

const EDITABLE_FIELDS = [
  "flight_number",
  "origin_code",
  "dest_code",
  "departure_time",
  "arrival_time",
  "base_price",
  "status",
];

export async function GET(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;
    const flight = await Flight.findById(id)
      .populate("airline_id", "code name")
      .populate("aircraft_id", "name");

    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    return NextResponse.json(flight);
  } catch (err) {
    return handleApiError(err, "GET /api/admin/flights/[id]");
  }
}

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;
    const body = await request.json();

    // Chỉ lấy đúng field cho phép sửa — bỏ qua mọi field khác (kể cả nếu
    // client cố tình gửi aircraft_id/seats/airline_id lên).
    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (body?.[field] !== undefined) updates[field] = body[field];
    }
    if (updates.origin_code) updates.origin_code = updates.origin_code.toUpperCase();
    if (updates.dest_code) updates.dest_code = updates.dest_code.toUpperCase();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "Không có field hợp lệ nào để cập nhật." }, { status: 400 });
    }

    const flight = await Flight.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    return NextResponse.json(flight);
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/flights/[id]");
  }
}
