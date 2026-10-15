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
import { logAdminAction } from "@/lib/adminLog";

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
    const admin = await requireAdminUser();
    const body = (await request.json().catch(() => null)) ?? {};
    const created = await createRoute(body);
    await logAdminAction(admin, {
      action: "popular_route.create", targetType: "popular_route",
      summary: `Thêm tuyến phổ biến ${String(body?.origin_code ?? "").toUpperCase()} → ${String(body?.dest_code ?? "").toUpperCase()}`,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/popular-routes");
  }
}
