// components/layout/Header.jsx
//
// Server Component — gọi thẳng auth() để biết có session hay không (KHÔNG
// phải để check is_blocked, việc đó là của lib/requireActiveUser.js ở đúng
// hành động nhạy cảm — ở đây chỉ để hiện đúng UI đăng nhập/đăng xuất).

import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import { signOutAction } from "./authActions";
import Button from "../ui/Button";

export default async function Header() {
  const [t, tBrand, session] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Brand"),
    auth(),
  ]);

  return (
    <header className="border-b border-sand-100 bg-sand-50/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="font-display text-xl font-semibold text-sea-900">
          {tBrand("name")}
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-sea-900 md:flex">
          <Link href="/" className="hover:text-coral-600">
            {t("search")}
          </Link>
          <Link href="/my-bookings" className="hover:text-coral-600">
            {t("myBookings")}
          </Link>
          <Link href="/check-in" className="hover:text-coral-600">
            {t("checkIn")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          {session?.user ? (
            <form action={signOutAction}>
              <Button type="submit" variant="ghost">
                {t("logout")}
              </Button>
            </form>
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
