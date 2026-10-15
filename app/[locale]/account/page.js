// app/[locale]/account/page.js
//
// Trang Tài khoản (bổ sung C8): xem email, sửa họ tên, đổi mật khẩu. Nằm trong PROTECTED_SEGMENTS
// (proxy.js) — bắt buộc đăng nhập; guardActivePage() kiểm tra is_blocked / phiên hết hiệu lực từ DB.

import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { guardActivePage } from "@/lib/guardActivePage";
import { toVN } from "@/lib/timezone";
import Card from "@/components/ui/Card";
import ProfileForm from "./ProfileForm";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Account");

  const user = await guardActivePage(await auth());

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-2xl">
        <h1 className="font-display text-2xl font-semibold text-sea-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">
          {user.email} · {t("memberSince", { date: toVN(user.created_at).format("DD/MM/YYYY") })}
        </p>
      </div>

      <Card className="w-full max-w-2xl p-6">
        <h2 className="font-display text-lg font-semibold text-sea-900">{t("profileTitle")}</h2>
        <ProfileForm initialName={user.full_name} email={user.email} />
      </Card>

      <Card className="w-full max-w-2xl p-6">
        <h2 className="font-display text-lg font-semibold text-sea-900">{t("passwordTitle")}</h2>
        <p className="mt-1 text-xs text-ink/60">{t("passwordHint")}</p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
