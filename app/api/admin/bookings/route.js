// app/api/admin/bookings/route.js
//
// A3 — danh sách MỌI booking cho admin (khác /api/bookings/my, chỉ trả
// booking của chính user đang đăng nhập). Lọc theo status qua query param
// tùy chọn (?status=confirmed) — hữu ích khi danh sách dài.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Booking from "@/models/Booking";
// Side-effect import — populate("user_id") bên dưới cần model User đã được
// nạp, cùng lớp bug với models/Airline.js đã ghi chú ở app/api/admin/flights
// (MissingSchemaError nếu route này bundle riêng, không tình cờ đi kèm file
// khác đã require User trước).
import "@/models/User";

const VALID_STATUSES = [
  "pending_payment",
  "confirmed",
  "cancelled",
  "refunded",
  "payment_error_manual_refund",
];

export async function GET(request) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

    const filter = {};
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { message: `status không hợp lệ — phải là 1 trong: ${VALID_STATUSES.join(", ")}.` },
          { status: 400 }
        );
      }
      filter.status = status;
    }

    const bookings = await Booking.find(filter, "-passengers.document_id")
      .populate("user_id", "email full_name")
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ bookings });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/bookings");
  }
}
