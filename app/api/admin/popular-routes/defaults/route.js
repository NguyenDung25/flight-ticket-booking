// app/api/admin/popular-routes/defaults/route.js
//
// POST — nạp danh sách mặc định (12 tuyến trong lib/popularRoutes.js) vào DB để admin bắt đầu tùy chỉnh.
// Chỉ chạy được khi chưa có tuyến nào (409 nếu đã tùy chỉnh).

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { seedDefaults } from "@/services/popularRouteService";
import { logAdminAction } from "@/lib/adminLog";

export async function POST() {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const result = await seedDefaults();
    await logAdminAction(admin, {
      action: "popular_route.seed_defaults", targetType: "popular_route",
      summary: "Nạp danh sách tuyến phổ biến mặc định",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/popular-routes/defaults");
  }
}
