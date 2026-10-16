// components/layout/Header.jsx
//
// Server Component — gọi thẳng auth() để biết có session hay không (KHÔNG
// phải để check is_blocked, việc đó là của lib/requireActiveUser.js ở đúng
// hành động nhạy cảm — ở đây chỉ để hiện đúng UI đăng nhập/đăng xuất + tên
// người dùng).
//
// MobileMenu (hamburger) tách thành Client Component riêng vì cần useState
// toggle mở/đóng — Header giữ nguyên Server Component để có thể gọi
// auth()/getTranslations() trực tiếp không cần "use client".

import { getTranslations } from "next-intl/server";
import NextLink from "next/link";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import MobileMenu from "./MobileMenu";
import DesktopNav from "./DesktopNav";
import { signOutAction } from "./authActions";
import Button from "../ui/Button";

export default async function Header() {
  const [t, tBrand, session] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Brand"),
    auth(),
  ]);

  const navLinks = [
    { href: "/", label: t("search") },
    { href: "/my-bookings", label: t("myBookings") },
    { href: "/check-in", label: t("checkIn") },
    { href: "/promotions", label: t("promotions") },
    { href: "/cancellation-policy", label: t("cancellationPolicy") },
  ];

  // Nút "Đăng ký" trên thanh header bị ẩn dưới breakpoint sm (chật chỗ) — đưa
  // vào menu hamburger để khách dùng điện thoại vẫn đăng ký được.
  // Admin đang xem giao diện khách -> có đường quay lại khu quản trị. /admin KHÔNG nằm dưới
  // [locale] và có root layout riêng, nên dùng Link của next/link (không prefix locale, Next tự tải
  // trang mới khi đổi root layout) — KHÔNG dùng Link của next-intl.
  // Chỉ để hiện nút: quyền thật vẫn do app/admin/layout.js kiểm tra tươi từ DB.
  const isAdmin = session?.user?.role === "admin";
  const adminLink = isAdmin ? { href: "/admin", label: t("adminPanel"), plain: true } : null;

  const accountLink = { href: "/account", label: t("account") };
  const mobileLinks = session?.user
    ? adminLink
      ? [...navLinks, accountLink, adminLink]
      : [...navLinks, accountLink]
    : [...navLinks, { href: "/register", label: t("register") }];

  return (
    <header className="relative border-b border-sand-100 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6 xl:gap-6">
        <div className="flex items-center gap-2">
          {/* Hamburger — chỉ hiện < lg (chính MobileMenu tự có class
              "lg:hidden" trên root của nó; 5 mục menu không đủ chỗ ở khổ md), đặt bên trái brand cho quen tay
              (giống đa số app mobile). */}
          <MobileMenu links={mobileLinks} />
          {/* Tên web là liên kết về trang chủ (không dùng biểu tượng riêng). */}
          <Link href="/" className="text-xl font-bold tracking-tight text-ink hover:text-coral-600">
            {tBrand("name")}
          </Link>
        </div>

        {/* Mục menu của trang đang mở được ẩn đi (DesktopNav / MobileMenu, xem navFilter.js). */}
        <DesktopNav links={navLinks} />

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {session?.user ? (
            <>
              {isAdmin && (
                <NextLink
                  href="/admin"
                  prefetch={false}
                  className="hidden h-9 items-center whitespace-nowrap rounded-lg border border-sand-200 px-3 text-xs font-semibold text-ink transition-colors hover:border-ink/40 lg:inline-flex"
                >
                  {t("adminPanel")}
                </NextLink>
              )}
              {/* Tên/email người đang đăng nhập — ẩn trên mobile (đã chật
                  chỗ với hamburger + logo), chỉ hiện từ sm trở lên. Ưu tiên
                  hiện `name` nếu auth.js có set (xem callbacks.session ở
                  auth.js), fallback về `email` vì đó là field CHẮC CHẮN luôn
                  có (models/User.js bắt buộc, name thì không). */}
              <Link
                href="/account"
                title={`${t("account")} — ${session.user.email}`}
                className="hidden max-w-[10rem] truncate text-sm font-medium text-ink hover:text-coral-600 xl:inline"
              >
                {session.user.name || session.user.email}
              </Link>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" className="whitespace-nowrap px-3">
                  {t("logout")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-ink hover:text-coral-600"
              >
                {t("login")}
              </Link>
              <Link
                href="/register"
                className="hidden h-10 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-sea-700 sm:inline-flex"
              >
                {t("register")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
