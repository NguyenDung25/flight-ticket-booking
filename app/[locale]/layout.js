import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  // Dùng namespace "Metadata" đã dịch sẵn trong messages/*.json thay vì hard-code tiếng Việt.
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;

  // C11: locale không hợp lệ (không nằm trong routing.locales) -> 404, không âm thầm fallback ở đây.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Bắt buộc gọi trước khi render để các Server Component con.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <Header />
          {/* flex-1 để Footer luôn bị đẩy xuống đáy màn hình kể cả khi trang ngắn (VD trang lỗi, trang trống). */}
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
