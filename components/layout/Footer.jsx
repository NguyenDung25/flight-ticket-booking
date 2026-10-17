import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function Footer() {
  const [t, tNav] = await Promise.all([getTranslations("Brand"), getTranslations("Nav")]);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-sand-100 bg-white py-8 text-sm text-ink/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
        <span>
          <span className="font-bold text-ink">{t("name")}</span> · {t("tagline")} · © {year}
        </span>
        <nav aria-label={t("name")} className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/promotions" className="hover:text-coral-600">
            {tNav("promotions")}
          </Link>
          <Link href="/cancellation-policy" className="hover:text-coral-600">
            {tNav("cancellationPolicy")}
          </Link>
          <Link href="/check-in" className="hover:text-coral-600">
            {tNav("checkIn")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
