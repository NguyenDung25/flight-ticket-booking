import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { setImage, removeImage } from "@/services/popularRouteService";
import { MAX_IMAGE_BYTES } from "@/lib/imageSniff";
import { logAdminAction } from "@/lib/adminLog";

export async function PUT(request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const { id } = await params;

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ message: "Chưa chọn file ảnh." }, { status: 400 });
    }
    // Chặn sớm theo kích thước khai báo trước khi đọc cả file vào bộ nhớ; service vẫn kiểm tra lại byte thật.
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ message: "Ảnh quá lớn (tối đa 1 MB)." }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await setImage(id, buffer);
    await logAdminAction(admin, {
      action: "popular_route.image_update", targetType: "popular_route", targetId: id,
      summary: "Đổi ảnh nền tuyến phổ biến",
      details: { size_bytes: buffer.length },
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "PUT /api/admin/popular-routes/[id]/image");
  }
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const { id } = await params;
    const result = await removeImage(id);
    await logAdminAction(admin, {
      action: "popular_route.image_delete", targetType: "popular_route", targetId: id,
      summary: "Xóa ảnh nền tuyến phổ biến",
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/popular-routes/[id]/image");
  }
}
