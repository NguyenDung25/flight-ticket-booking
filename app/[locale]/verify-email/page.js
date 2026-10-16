// app/[locale]/verify-email/page.js — mở từ link xác thực trong email (?token=...).
// Trang công khai (không cần đăng nhập — khách có thể mở link trên máy khác). Token dùng 1 lần, hết
// hạn sau 24 giờ (services/accountService.verifyEmail). Mở lại link đã dùng -> báo không hợp lệ, kèm
// hướng dẫn gửi lại ở trang Tài khoản.

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import dbConnect from "@/lib/mongodb";
import Card from "@/components/ui/Card";
import { verifyEmail } from "@/services/accountService";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");
  const { token } = await searchParams;

  let verifiedEmail = null;
  try {
    await dbConnect();
    verifiedEmail = (await verifyEmail({ token })).email;
  } catch (err) {
    if (typeof err?.statusCode !== "number") console.error("[verify-email]", err);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-sand-50 px-4 py-16">
      <Card className="w-full max-w-sm p-8">
        <h1 className="font-display text-2xl font-semibold text-sea-900">{t("verifyTitle")}</h1>
        {verifiedEmail ? (
          <>
            <p role="status" className="mt-6 rounded-lg bg-sea-700/10 px-3 py-3 text-sm text-sea-900">
              {t("verifySuccess", { email: verifiedEmail })}
            </p>
            <p className="mt-6 text-center text-sm">
              <Link href="/" className="font-medium text-sea-500 hover:underline">
                {t("verifyGoSearch")}
              </Link>
            </p>
          </>
        ) : (
          <>
            <p role="alert" className="mt-6 text-sm text-danger">
              {t("verifyLinkInvalid")}
            </p>
            <p className="mt-6 text-center text-sm">
              <Link href="/account" className="font-medium text-sea-500 hover:underline">
                {t("verifyResendFromAccount")}
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
