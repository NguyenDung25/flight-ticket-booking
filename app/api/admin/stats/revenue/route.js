import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { getRevenueByMonth, getRevenueByRoute } from "@/services/statsService";

export async function GET(request) {
  try {
    await dbConnect();
    await requireAdminUser();

    // ?month=YYYY-MM (giờ VN): by_route chỉ tính tháng đó (sai định dạng -> 400); bỏ trống = toàn thời gian.
    const month = new URL(request.url).searchParams.get("month") ?? undefined;
    const [byMonth, byRoute] = await Promise.all([getRevenueByMonth(), getRevenueByRoute(month)]);

    return NextResponse.json({ by_month: byMonth, by_route: byRoute });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/stats/revenue");
  }
}
