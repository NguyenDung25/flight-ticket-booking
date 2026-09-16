"use client";

// components/layout/LanguageSwitcher.jsx
//
// Đổi ngôn ngữ mà giữ nguyên trang đang xem (VD đang ở /booking/123 đổi
// sang en -> /en/booking/123, không nhảy về trang chủ) — nhờ usePathname/
// useRouter lấy từ i18n/navigation.js (bản có biết locale), không phải
// next/navigation gốc.

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABELS = {
  vi: "Tiếng Việt",
  en: "English",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Nav");

  return (
    <select
      aria-label={t("language")}
      value={locale}
      onChange={(event) => {
        router.replace(pathname, { locale: event.target.value });
      }}
      className="rounded-lg border border-sand-100 bg-sand-50 px-2 py-1.5 text-sm text-ink"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l] ?? l}
        </option>
      ))}
    </select>
  );
}
