// proxy.js
//
// Next.js 16 đổi tên quy ước này từ `middleware.js` -> `proxy.js` (export
// mặc định hoặc export tên `proxy`, hành vi giữ nguyên). Xem
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
//
// Ghép 2 việc CHUNG 1 file vì Next.js chỉ gọi đúng 1 proxy cho mỗi request:
// 1) next-intl — locale routing (C11) cho khu vực khách hàng.
// 2) NextAuth — chặn sớm những route CẦN đăng nhập (C4/C5/C6 đặt vé & thanh
//    toán, C9 quản lý vé, C10 check-in), redirect về đúng trang /login theo
//    ĐÚNG locale hiện tại thay vì luôn về "/".
//
// Import `auth.config.js` (KHÔNG import `auth.js`) — xem comment trong
// auth.config.js để rõ vì sao: file đó không đụng DB/bcrypt nên load nhanh
// trên mọi request, kể cả các trang không cần biết gì về đăng nhập.
//
// LƯU Ý QUAN TRỌNG: proxy CHỈ trả lời được "có JWT hợp lệ hay không" — hoàn
// toàn KHÔNG check `is_blocked` (ghi chú q ở models/User.js), vì token có
// thể còn hiệu lực dù admin vừa khóa tài khoản. Việc check is_blocked PHẢI
// đọc thẳng DB tại đúng lúc hành động nhạy cảm, xem lib/requireActiveUser.js.

import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import authConfig from "./auth.config";
import { routing } from "./i18n/routing";

const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

// Locale không phải mặc định (hiện chỉ "en") — dùng để dựng lại prefix khi
// redirect, vì routing.localePrefix = "as-needed" nên locale mặc định
// ("vi") KHÔNG có prefix trên URL.
const nonDefaultLocales = routing.locales.filter(
  (l) => l !== routing.defaultLocale
);
const localePrefixRe = new RegExp(`^/(${nonDefaultLocales.join("|")})(?=/|$)`);

// Các nhóm route CẦN đăng nhập, KHÔNG tính locale prefix (regex bên dưới tự
// cho phép prefix đứng trước). Cập nhật danh sách này khi thêm route mới
// cần bảo vệ.
const PROTECTED_SEGMENTS = ["booking", "payment", "my-bookings", "check-in"];
const protectedPathnameRe = new RegExp(
  `^(/(${nonDefaultLocales.join("|")}))?/(${PROTECTED_SEGMENTS.join("|")})(/.*)?$`
);

export default auth((req) => {
  const { nextUrl } = req;
  const isProtectedRoute = protectedPathnameRe.test(nextUrl.pathname);
  const isLoggedIn = !!req.auth?.user;

  if (isProtectedRoute && !isLoggedIn) {
    const localeMatch = nextUrl.pathname.match(localePrefixRe);
    const loginPath = localeMatch ? `${localeMatch[0]}/login` : "/login";
    const loginUrl = new URL(loginPath, nextUrl);
    // Để trang /login biết redirect lại đâu sau khi đăng nhập thành công.
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Không phải route cần chặn (hoặc đã đăng nhập) -> giao lại cho next-intl
  // xử lý locale routing như bình thường.
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // Chạy trên mọi path CHÍNH của khu vực khách hàng, trừ:
    // - /admin (A1-A8, cố định tiếng Việt, không qua next-intl/NextAuth ở đây)
    // - /api (route handler tự xử lý auth riêng, không cần locale prefix)
    // - _next/static, _next/image (asset nội bộ Next.js)
    // - các file tĩnh có đuôi (favicon.ico, *.svg, *.png...)
    "/((?!admin|api|_next/static|_next/image|.*\\..*).*)",
  ],
};
