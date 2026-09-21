// i18n/navigation.js
//
// C11 — bản Link/redirect/usePathname/useRouter của next-intl, TỰ BIẾT locale
// hiện tại. Dùng THAY CHO next/link + next/navigation trong MỌI component
// dưới app/[locale]/... và components/ dùng chung cho khu vực khách.
//
// Vì routing.localePrefix = "as-needed" (xem i18n/routing.js), các hàm này
// tự lo phần khác biệt: <Link href="/my-bookings"> khi đang ở tiếng Việt ra
// đúng "/my-bookings" (không prefix), còn khi đang ở tiếng Anh tự thành
// "/en/my-bookings" — nơi gọi CHỈ cần viết path "trần", không tự ghép locale.
//
// usePathname() ở đây cũng trả path ĐÃ BỎ locale prefix (VD đang ở
// /en/booking/123 -> "/booking/123"), nên LanguageSwitcher đưa thẳng kết quả
// đó vào router.replace(pathname, { locale }) là đổi ngôn ngữ mà vẫn giữ
// nguyên trang đang xem — khác next/navigation gốc (sẽ trả cả "/en/...", gây
// lặp prefix thành /en/en/...).
//
// KHÔNG dùng file này trong app/admin/... — khu vực admin cố định tiếng Việt,
// không qua next-intl (xem proxy.js: matcher đã loại trừ /admin).

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
