// app/api/admin/popular-routes/route.js
//
// Tuyến bay phổ biến ở trang chủ (Admin → Chuyến bay → tab "Tuyến phổ biến").
// GET  — danh sách (không kèm ảnh nhị phân).
// POST — thêm tuyến { origin_code, dest_code }.
// Sửa/xóa: [id]/route.js; ảnh: [id]/image/route.js; nạp mặc định: defaults/route.js.
// Mọi route trả về danh sách mới nhất { routes, usingDefaults } để client cập nhật ngay.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { createRoute, listForAdmin } from "@/services/popularRouteService";

export async function GET() {
  try {
    await dbConnect();
    await requireAdminUser();
    return NextResponse.json(await listForAdmin());
  } catch (err) {
    return handleApiError(err, "GET /api/admin/popular-routes");
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    await requireAdminUser();
    const body = (await request.json().catch(() => null)) ?? {};
    return NextResponse.json(await createRoute(body), { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/popular-routes");
  }
}
