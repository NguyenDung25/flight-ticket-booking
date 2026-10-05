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
import Link from "next/link";
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
  title: "Quản trị — Sun Phú Quốc Airways",
};

const NAV_ITEMS = [
  { href: "/admin/users", label: "Người dùng" },
  { href: "/admin/bookings", label: "Booking" },
  { href: "/admin/flights", label: "Chuyến bay" },
  { href: "/admin/airlines", label: "Hãng bay" },
  { href: "/admin/aircraft", label: "Máy bay" },
  { href: "/admin/promotions", label: "Khuyến mãi" },
  { href: "/admin/refunds", label: "Hoàn tiền" },
  { href: "/admin/stats", label: "Thống kê" },
];

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
      <body className="flex min-h-full flex-col bg-sand-50 text-ink">
        <header className="border-b border-sand-100 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-4 lg:justify-start">
              <Link href="/admin" className="font-display text-lg font-semibold text-sea-900">
                Quản trị
              </Link>
              {/* Nhóm này chuyển sang hàng đầu cùng brand trên mobile/tablet
                  (chỗ trống rộng hơn để căn phải), rồi mới xuống lg mới tách
                  ra hàng riêng bên phải — tránh brand + admin.email + nút
                  "Về giao diện khách" chen cùng 8 mục nav trên 1 hàng, đúng
                  nguyên nhân tràn/chồng đã báo. */}
              <div className="flex items-center gap-4 lg:hidden">
                <Link
                  href="/"
                  className="rounded-lg border border-sea-700 px-3 py-1.5 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
                >
                  ← Về giao diện khách
                </Link>
                <span className="text-sm text-ink/60">{admin.email}</span>
              </div>
            </div>

            {/* 8 mục — cuộn ngang thay vì tràn/chồng khi màn hình hẹp hơn
                bề rộng cần thiết (thay vì flex-wrap xuống nhiều hàng, vì nav
                admin dùng thường xuyên, cuộn ngang 1 hàng dễ quét mắt hơn
                nhảy dòng lộn xộn). -mx-6 px-6 để vùng cuộn tràn hết bề ngang
                khả dụng kể cả trong lúc đang cuộn (che mất padding cha). */}
            <nav className="-mx-6 flex gap-5 overflow-x-auto whitespace-nowrap px-6 text-sm font-medium text-sea-700 lg:mx-0 lg:px-0">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="shrink-0 hover:underline">
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="hidden items-center gap-4 lg:flex">
              <Link
                href="/"
                className="rounded-lg border border-sea-700 px-3 py-1.5 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
              >
                ← Về giao diện khách
              </Link>
              <span className="text-sm text-ink/60">{admin.email}</span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
