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
