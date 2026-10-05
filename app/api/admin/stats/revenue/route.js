// app/api/admin/stats/revenue/route.js
//
// A6 — endpoint duy nhất trả CẢ 2 chiều thống kê (theo tháng + theo tuyến)
// trong 1 lần gọi, vì trang admin/stats hiển thị cả 2 cùng lúc và cả 2 đều
// đọc trên cùng tập Booking — tách 2 request riêng chỉ tốn thêm 1 round-trip
// vô ích, không có lý do UX nào cần tải riêng lẻ.
//
// page.js (app/admin/stats) KHÔNG gọi route này — page.js gọi thẳng
// statsService (server-side sẵn, đúng convention mọi trang admin khác).
// Route này giữ lại cho nơi khác có thể cần (VD nếu sau này thêm export
// CSV/Excel qua client, hoặc dashboard tự refresh bằng fetch).

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { getRevenueByMonth, getRevenueByRoute } from "@/services/statsService";

export async function GET() {
  try {
    await dbConnect();
    await requireAdminUser();

    const [byMonth, byRoute] = await Promise.all([getRevenueByMonth(), getRevenueByRoute()]);

    return NextResponse.json({ by_month: byMonth, by_route: byRoute });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/stats/revenue");
  }
}
