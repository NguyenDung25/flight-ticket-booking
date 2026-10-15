// app/api/admin/popular-routes/[id]/image/route.js
//
// PUT    — tải ảnh nền cho tuyến (multipart/form-data, field "file"; JPG/PNG/WebP, tối đa 1 MB — kiểm tra
//          theo NỘI DUNG file ở services/popularRouteService.js, không tin đuôi/Content-Type client gửi).
// DELETE — xóa ảnh (thẻ quay về hình minh họa mặc định).
// Ảnh được phục vụ công khai ở app/api/popular-routes/[id]/image/route.js.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { setImage, removeImage } from "@/services/popularRouteService";
import { MAX_IMAGE_BYTES } from "@/lib/imageSniff";

export async function PUT(request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();
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
    return NextResponse.json(await setImage(id, buffer));
  } catch (err) {
    return handleApiError(err, "PUT /api/admin/popular-routes/[id]/image");
  }
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();
    const { id } = await params;
    return NextResponse.json(await removeImage(id));
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/popular-routes/[id]/image");
  }
}
