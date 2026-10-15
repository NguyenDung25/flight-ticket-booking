// app/admin/stats/page.js
//
// Thống kê doanh thu đã chuyển vào trang Tổng quan (/admin) — giữ route cũ chỉ để link/bookmark cũ không
// bị 404: chuyển thẳng về /admin (trang đó tự kiểm tra quyền admin).

import { redirect } from "next/navigation";

export default function AdminStatsRedirect() {
  redirect("/admin");
}
