// components/layout/navFilter.js
//
// Ẩn mục menu trỏ tới CHÍNH trang đang mở (giao diện khách): đang ở /check-in thì không hiện
// "Check-in", ở trang chủ thì không hiện "Tìm chuyến bay" (trang chủ đã có form tìm chuyến).
// So khớp ĐÚNG đường dẫn (không theo tiền tố): ở /my-bookings/<id>/ticket vẫn hiện "Vé của tôi"
// để quay lại danh sách. `pathname` lấy từ usePathname() của next-intl (đã bỏ /en).

export function hideCurrentPage(links, pathname) {
  const current = (pathname || "/").replace(/\/+$/, "") || "/";
  return links.filter((l) => l.plain || l.href !== current);
}
