// app/[locale]/layout.js
//
// C11 — đây là ROOT LAYOUT của khu vực khách hàng (chứa thẻ <html>/<body>),
// tách riêng khỏi app/admin/layout.js (khu vực Admin, cố định tiếng Việt,
// không qua next-intl). Next.js cho phép nhiều "root layout" song song khi
// các segment cấp cao nhất (ở đây là [locale] và admin) không chia sẻ 1
// app/layout.js chung — xem "Multiple root layouts" trong docs Next.js.
//
// KHÔNG còn app/layout.js dùng chung nữa vì 2 khu vực cần <html lang=...>
// khác nhau (động theo locale vs luôn "vi").

import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { routing } from "@/i18n/routing";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  // Dùng namespace "Metadata" đã dịch sẵn trong messages/*.json thay vì
  // hard-code tiếng Việt — title/description đổi theo locale, đúng C11.
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;

  // C11: locale không hợp lệ (không nằm trong routing.locales) -> 404,
  // KHÔNG âm thầm fallback ở đây (fallback locale nội dung đã xử lý ở
  // i18n/request.js, đây là validate route param).
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Bắt buộc gọi trước khi render để các Server Component con (kể cả khi
  // dùng cache/static rendering) đọc đúng locale hiện tại.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <Header />
          {/* flex-1 để Footer luôn bị đẩy xuống đáy màn hình kể cả khi trang
              ngắn (VD trang lỗi, trang trống) — không dùng position: fixed. */}
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
