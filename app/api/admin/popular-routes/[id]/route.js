// app/api/admin/popular-routes/[id]/route.js
//
// PATCH  — { active: boolean } ẩn/hiện, hoặc { direction: "up" | "down" } đổi thứ tự.
// DELETE — xóa tuyến (và ảnh của nó). Điểm đi/đến không sửa được: muốn đổi thì xóa và thêm tuyến mới.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { updateRoute, deleteRoute } from "@/services/popularRouteService";
import { logAdminAction } from "@/lib/adminLog";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) ?? {};
    const updated = await updateRoute(id, body);
    await logAdminAction(admin, {
      action: "popular_route.update", targetType: "popular_route", targetId: id,
      summary: "Sửa 1 tuyến phổ biến (ẩn/hiện, thứ tự)",
      details: { active: body?.active, sort_order: body?.sort_order },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/popular-routes/[id]");
  }
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const { id } = await params;
    const result = await deleteRoute(id);
    await logAdminAction(admin, {
      action: "popular_route.delete", targetType: "popular_route", targetId: id,
      summary: "Xóa 1 tuyến phổ biến",
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/popular-routes/[id]");
  }
}
