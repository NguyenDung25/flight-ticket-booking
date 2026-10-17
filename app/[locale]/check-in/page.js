import { getTranslations, setRequestLocale } from "next-intl/server";
import { normalizeBookingCode } from "@/lib/bookingCode";
import CheckInLookup from "./CheckInLookup";

export default async function CheckInPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CheckIn");

  const sp = await searchParams;
  const initialCode = normalizeBookingCode(typeof sp.code === "string" ? sp.code : "") ?? "";

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">{t("windowNote")}</p>
      </div>
      <CheckInLookup initialCode={initialCode} />
    </div>
  );
}
