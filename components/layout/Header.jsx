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
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import MobileMenu from "./MobileMenu";
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
  ];

  // Nút "Đăng ký" trên thanh header bị ẩn dưới breakpoint sm (chật chỗ) — đưa
  // vào menu hamburger để khách dùng điện thoại vẫn đăng ký được.
  const mobileLinks = session?.user
    ? navLinks
    : [...navLinks, { href: "/register", label: t("register") }];

  return (
    <header className="relative border-b border-sand-100 bg-sand-50/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-2">
          {/* Hamburger — chỉ hiện < md (chính MobileMenu tự có class
              "md:hidden" trên root của nó), đặt bên trái brand cho quen tay
              (giống đa số app mobile). */}
          <MobileMenu links={mobileLinks} />
          <Link href="/" className="font-display text-xl font-semibold text-sea-900">
            {tBrand("name")}
          </Link>
        </div>

        <nav className="hidden items-center gap-6 text-sm font-medium text-sea-900 md:flex">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-coral-600">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {session?.user ? (
            <>
              {/* Tên/email người đang đăng nhập — ẩn trên mobile (đã chật
                  chỗ với hamburger + logo), chỉ hiện từ sm trở lên. Ưu tiên
                  hiện `name` nếu auth.js có set (xem callbacks.session ở
                  auth.js), fallback về `email` vì đó là field CHẮC CHẮN luôn
                  có (models/User.js bắt buộc, name thì không). */}
              <span
                title={session.user.email}
                className="hidden max-w-[10rem] truncate text-sm text-ink/70 sm:inline"
              >
                {session.user.name || session.user.email}
              </span>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost">
                  {t("logout")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-sea-900 hover:text-coral-600"
              >
                {t("login")}
              </Link>
              <Link
                href="/register"
                className="hidden rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white hover:bg-coral-600 sm:inline-flex"
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
