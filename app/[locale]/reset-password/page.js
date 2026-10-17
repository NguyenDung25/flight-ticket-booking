import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");
  const { token } = await searchParams;
  const validShape = typeof token === "string" && /^[0-9a-f]{64}$/.test(token);

  return (
    <div className="flex flex-1 items-center justify-center bg-sand-50 px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("resetTitle")}</h1>
        <div className="mt-6">
          {validShape ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p role="alert" className="text-sm text-danger">
              {t("resetLinkInvalid")}
            </p>
          )}
        </div>
        <p className="mt-6 text-center text-sm text-ink/70">
          <Link href="/forgot-password" className="font-medium text-sea-500 hover:underline">
            {t("requestNewLink")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
