// app/api/popular-routes/[id]/image/route.js
//
// GET — phục vụ ảnh nền của thẻ tuyến phổ biến (công khai, trang chủ khách dùng). Loại ảnh lấy từ NỘI DUNG
// đã được kiểm tra lúc tải lên (chỉ JPEG/PNG/WebP). URL luôn kèm ?v=<mốc cập nhật ảnh> nên cache immutable
// an toàn: đổi ảnh = URL mới.

import dbConnect from "@/lib/mongodb";
import { getImage } from "@/services/popularRouteService";

export async function GET(_request, { params }) {
  try {
    await dbConnect();
    const { id } = await params;
    const img = await getImage(id);
    if (!img) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(img.data), {
      headers: {
        "Content-Type": img.content_type,
        "Content-Length": String(img.data.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[API ERROR] GET /api/popular-routes/[id]/image", err);
    return new Response("Error", { status: 500 });
  }
}
