import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default async function ForgotPasswordPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  return (
    <div className="flex flex-1 items-center justify-center bg-sand-50 px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("forgotTitle")}</h1>
        <p className="mt-2 text-sm text-ink/60">{t("forgotHint")}</p>
        <div className="mt-6">
          <ForgotPasswordForm />
        </div>
        <p className="mt-6 text-center text-sm text-ink/70">
          <Link href="/login" className="font-medium text-sea-500 hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
