// app/[locale]/register/page.js

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import RegisterForm from "./RegisterForm";

export default async function RegisterPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  return (
    <div className="flex flex-1 items-center justify-center bg-sand-50 px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <h1 className="font-display text-2xl font-semibold text-sea-900">
          {t("registerTitle")}
        </h1>

        <div className="mt-6">
          <RegisterForm />
        </div>

        <p className="mt-6 text-center text-sm text-ink/70">
          {t("hasAccount")}{" "}
          <Link href="/login" className="font-medium text-sea-500 hover:underline">
            {t("loginButton")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
