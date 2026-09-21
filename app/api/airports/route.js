// app/api/airports/route.js
//
// C1 — danh sách sân bay cho dropdown điểm đi/điểm đến. PUBLIC (không cần
// đăng nhập — tìm kiếm chuyến bay mở cho mọi khách, chỉ từ C5 chọn ghế trở
// đi mới bắt buộc login, xem PROTECTED_CUSTOMER_PATHS trong proxy.js).
//
// Chỉ trả field UI cần (code/name/city/country) — không trả nguyên document
// nếu Airport có thêm field khác không liên quan sau này.

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
