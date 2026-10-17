import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { ActiveUserError } from "@/lib/requireActiveUser";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "../globals.css";

// Bắt buộc: build (`next build`) mặc định cố prerender tĩnh mọi route nếu không thấy tín hiệu "cần render động"…
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quản trị — DelayX",
};

export default async function AdminLayout({ children }) {
  let admin;
  try {
    admin = await requireAdminUser();
  } catch (err) {
    if (err instanceof ActiveUserError && err.statusCode === 401) {
      redirect("/login?callbackUrl=/admin");
    }
    // 403 (đã đăng nhập nhưng không phải admin, hoặc tài khoản bị khóa) -> về trang chủ.
    redirect("/");
  }

  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full bg-sand-50 text-ink">
        {/* Menu trái (md trở lên) / hàng ngang trên cùng (màn hình hẹp) + thanh trên có tên trang, đăng xuất. */}
        <div className="flex min-h-screen flex-col md:flex-row">
          <AdminSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <AdminTopbar email={admin.email} />
            <main className="w-full flex-1 px-6 py-8 md:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
