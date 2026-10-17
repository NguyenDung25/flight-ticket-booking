"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABELS = {
  vi: "Tiếng Việt",
  en: "English",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Nav");

  function handleChange(event) {
    const newLocale = event.target.value;
    const query = Object.fromEntries(searchParams.entries());

    // 1. Đổi URL ngay lập tức
    router.replace({ pathname, query }, { locale: newLocale });

    // 2. Lưu vào DB (fire-and-forget)
    fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_language: newLocale }),
    }).catch(() => {
      // Bỏ qua lỗi: đổi ngôn ngữ trên URL đã xong, lưu DB chỉ là phụ
    });
  }

  return (
    <select
      aria-label={t("language")}
      value={locale}
      onChange={handleChange}
      className="h-9 rounded-lg border border-sand-100 bg-white px-2 text-sm text-ink hover:border-sand-200"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l] ?? l}
        </option>
      ))}
    </select>
  );
}
