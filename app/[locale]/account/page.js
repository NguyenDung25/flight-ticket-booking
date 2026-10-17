import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { guardActivePage } from "@/lib/guardActivePage";
import { toVN } from "@/lib/timezone";
import Card from "@/components/ui/Card";
import ProfileForm from "./ProfileForm";
import ChangePasswordForm from "./ChangePasswordForm";
import EmailVerification from "./EmailVerification";

export default async function AccountPage({ params, searchParams }) {
  const { locale } = await params;
  const { registered } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Account");

  const user = await guardActivePage(await auth());

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">
          {user.email} · {t("memberSince", { date: toVN(user.created_at).format("DD/MM/YYYY") })}
        </p>
        <EmailVerification verified={user.email_verified !== false} justRegistered={registered === "1"} />
      </div>

      <Card className="w-full max-w-2xl p-6">
        <h2 className="text-lg font-bold tracking-tight text-ink">{t("profileTitle")}</h2>
        <ProfileForm initialName={user.full_name} email={user.email} />
      </Card>

      <Card className="w-full max-w-2xl p-6">
        <h2 className="text-lg font-bold tracking-tight text-ink">{t("passwordTitle")}</h2>
        <p className="mt-1 text-xs text-ink/60">{t("passwordHint")}</p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
