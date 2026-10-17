import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import createIntlMiddleware from "next-intl/middleware";
import authConfig from "./auth.config";
import { routing } from "./i18n/routing";

const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

// Locale không phải mặc định (hiện chỉ "en") — dùng để dựng lại prefix khi redirect.
const nonDefaultLocales = routing.locales.filter(
  (l) => l !== routing.defaultLocale
);
const localePrefixRe = new RegExp(`^/(${nonDefaultLocales.join("|")})(?=/|$)`);

// Các nhóm route cần đăng nhập, không tính locale prefix (regex bên dưới tự cho phép prefix đứng trước).
const PROTECTED_SEGMENTS = ["booking", "payment", "my-bookings", "account"];
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

  // Không phải route cần chặn (hoặc đã đăng nhập) -> giao lại cho next-intl xử lý locale routing như bình thường.
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // Chạy trên mọi path chính của khu vực khách hàng, trừ: - /admin.
    "/((?!admin|api|_next/static|_next/image|.*\\..*).*)",
  ],
};
