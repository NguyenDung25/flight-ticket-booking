// components/layout/Footer.jsx

import { getTranslations } from "next-intl/server";

export default async function Footer() {
  const t = await getTranslations("Brand");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-sand-100 bg-sand-50 px-6 py-8 text-sm text-ink/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-display text-base text-sea-900">{t("name")}</span>
        <span>
          © {year} {t("name")} — {t("tagline")}
        </span>
      </div>
    </footer>
  );
}
