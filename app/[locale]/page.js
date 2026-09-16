// app/[locale]/page.js — C1: trang tìm kiếm chuyến bay.
// Hiện tại chỉ là khung đã nối i18n; form tìm kiếm thật sẽ làm ở bước sau.

import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center gap-6 py-32 px-16 bg-white dark:bg-black">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {t("title")}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {t("searchButton")} — form tìm chuyến bay sẽ được thêm ở bước sau.
        </p>
      </main>
    </div>
  );
}
