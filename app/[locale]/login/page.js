// app/[locale]/login/page.js
//
// C8 — proxy.js redirect khách chưa đăng nhập tới đây kèm
// ?callbackUrl=<path gốc họ định vào> (xem PROTECTED_CUSTOMER_PATHS trong
// proxy.js) — đọc lại searchParams để LoginForm biết đăng nhập xong quay về
// đâu, KHÔNG hard-code "/".

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import LoginForm from "./LoginForm";

export default async function LoginPage({ params, searchParams }) {
  const { locale } = await params;
  const { callbackUrl } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  return (
    <div className="flex flex-1 items-center justify-center bg-sand-50 px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <h1 className="font-display text-2xl font-semibold text-sea-900">
          {t("loginTitle")}
        </h1>

        <div className="mt-6">
          <LoginForm callbackUrl={callbackUrl || "/"} />
        </div>

        <p className="mt-6 text-center text-sm text-ink/70">
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-sea-500 hover:underline">
            {t("registerButton")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
