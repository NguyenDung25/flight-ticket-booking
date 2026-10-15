// app/api/admin/popular-routes/[id]/route.js
//
// PATCH  — { active: boolean } ẩn/hiện, hoặc { direction: "up" | "down" } đổi thứ tự.
// DELETE — xóa tuyến (và ảnh của nó). Điểm đi/đến không sửa được: muốn đổi thì xóa và thêm tuyến mới.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { updateRoute, deleteRoute } from "@/services/popularRouteService";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) ?? {};
    return NextResponse.json(await updateRoute(id, body));
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/popular-routes/[id]");
  }
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();
    const { id } = await params;
    return NextResponse.json(await deleteRoute(id));
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/popular-routes/[id]");
  }
}
