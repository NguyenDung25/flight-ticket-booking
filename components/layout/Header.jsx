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

  // Nút "Đăng ký" trên thanh header bị ẩn dưới breakpoint sm (chật chỗ).
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
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 xl:gap-6">
        <div className="flex items-center gap-2">
          {/* Hamburger — chỉ hiện < lg. */}
          <MobileMenu links={mobileLinks} logoutLabel={session?.user ? t("logout") : null} />
          {/* Tên web là liên kết về trang chủ (không dùng biểu tượng riêng). */}
          <Link href="/" className="text-xl font-bold tracking-tight text-ink hover:text-coral-600">
            {tBrand("name")}
          </Link>
        </div>

        {/* Mục menu của trang đang mở được ẩn đi (DesktopNav / MobileMenu, xem navFilter.js). */}
        <DesktopNav links={navLinks} />

        <div className="flex items-center gap-2 sm:gap-3">
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
              {/* Tên/email người đang đăng nhập — ẩn trên mobile (đã chật chỗ với hamburger + logo), chỉ hiện từ sm trở lên. */}
              <Link
                href="/account"
                title={`${t("account")} — ${session.user.email}`}
                className="hidden max-w-[10rem] truncate text-sm font-medium text-ink hover:text-coral-600 xl:inline"
              >
                {session.user.name || session.user.email}
              </Link>
              {/* Điện thoại: nút Đăng xuất nằm trong menu ☰ (MobileMenu) để header không bị tràn ngang. */}
              <form action={signOutAction} className="hidden sm:block">
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
