// app/admin/page.js
//
// Trang chủ khu vực Admin — BỊ THIẾU từ trước, gây đúng bug "đăng nhập admin
// không vào được giao diện quản trị": app/admin/layout.js tồn tại (và tự
// redirect("/admin") sau khi login xong nếu role=admin, xem
// app/[locale]/login/actions.js), nhưng KHÔNG có page.js nào khớp CHÍNH
// XÁC route "/admin" — Next.js App Router yêu cầu 1 layout.js PHẢI có ít
// nhất 1 page.js khớp đúng segment đó (hoặc segment con) mới render được
// nội dung; thiếu thì "/admin" tự 404 dù layout (header/nav) vẫn hiện ra
// bình thường — trông giống hệt "vào không được" dù auth guard đã chạy
// đúng và session/role hoàn toàn hợp lệ.
//
// Chỉ là trang tổng quan dẫn hướng — không tự lấy số liệu gì (đó là việc
// của /admin/stats), giữ nhẹ để không trùng lặp. Dùng <a> thường (không
// phải next/link hay next-intl Link) — nhất quán với app/admin/layout.js
// (khu vực admin không qua next-intl, và các route con đều same-origin
// thường, next/link chỉ có lợi prefetch mà chưa cần tới ở quy mô này).

const SECTIONS = [
  { href: "/admin/bookings", title: "Booking", desc: "Xem toàn bộ booking, hủy hộ khách (A3)." },
  { href: "/admin/users", title: "Người dùng", desc: "Khóa/mở khóa tài khoản (A4)." },
  { href: "/admin/flights", title: "Chuyến bay", desc: "Quản lý chuyến bay (A1)." },
  { href: "/admin/airlines", title: "Hãng bay", desc: "Quản lý hãng bay (A2)." },
  { href: "/admin/aircraft", title: "Máy bay", desc: "Quản lý loại máy bay, sơ đồ ghế (A2)." },
  { href: "/admin/refunds", title: "Hoàn tiền", desc: "Nhật ký hoàn tiền, chỉ đọc (A7)." },
  { href: "/admin/stats", title: "Thống kê", desc: "Doanh thu, số liệu tổng quan (A6)." },
];

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Tổng quan</h1>
        <p className="text-sm text-ink/60">Chọn 1 mục bên dưới hoặc trên thanh điều hướng.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="rounded-xl border border-sand-100 bg-white p-5 transition-colors hover:border-sea-500"
          >
            <p className="font-display text-base font-semibold text-sea-900">{s.title}</p>
            <p className="mt-1 text-sm text-ink/60">{s.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}