// app/admin/layout.js
//
// Root layout RIÊNG cho khu vực Admin (A1-A8) — dùng "Multiple root
// layouts" của Next.js (xem node_modules/next/dist/docs/01-app/03-api-
// reference/03-file-conventions/layout.md: "Omitting app/layout.js so
// layouts in subdirectories... each become root layouts for their
// respective directories"). KHÔNG có app/layout.js dùng chung với
// app/[locale]/layout.js vì <html lang> khác nhau: khách đổi theo locale,
// admin CỐ ĐỊNH "vi" (không qua next-intl — xem README/ghi chú kiến trúc).
//
// proxy.js LOẠI TRỪ HẲN /admin khỏi matcher (xem comment trong proxy.js:
// "/admin (A1-A8, cố định tiếng Việt, không qua next-intl/NextAuth ở đây)")
// — nghĩa là KHÔNG có lớp bảo vệ nào phía trước cho khu vực này, guard
// đăng nhập + role=admin PHẢI tự làm NGAY TẠI ĐÂY, ở layout gốc, để MỌI
// trang con (users, flights, bookings...) tự động được bảo vệ mà không
// phải tự lặp lại đoạn check này ở từng page.js riêng lẻ.
//
// Dùng requireAdminUser() (đọc thẳng DB, đúng ghi chú q) THAY VÌ chỉ tin
// session.user.role từ JWT — nếu admin vừa bị 1 admin khác khóa/hạ quyền,
// JWT cũ vẫn còn hiệu lực tới khi hết hạn, phải đọc tươi từ DB mới bắt được
// ngay, nhất quán với cách toàn bộ hành động nhạy cảm khác trong hệ thống
// đã làm (giữ ghế, tạo booking, thanh toán...).

import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { ActiveUserError } from "@/lib/requireActiveUser";
import "../globals.css";

// BẮT BUỘC: build (`next build`) mặc định cố PRERENDER TĨNH mọi route nếu
// không thấy tín hiệu "cần render động" rõ ràng — gọi auth()/DB bên trong
// requireAdminUser() không tự động được Next.js nhận diện là runtime-only ở
// đây, dẫn tới lỗi build thật (cố kết nối DB ngay lúc build). /admin PHẢI
// luôn render động: auth + is_blocked check tươi mỗi request (ghi chú q),
// không được cache/prerender — cascade xuống MỌI route con dưới /admin.
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
    // 403 (đã đăng nhập nhưng không phải admin, hoặc tài khoản bị khóa) ->
    // về trang chủ, KHÔNG lộ thông báo "bạn không có quyền admin" (không
    // xác nhận với khách thường là /admin có tồn tại/có ý nghĩa gì).
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
