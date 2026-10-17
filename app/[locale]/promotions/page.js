import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { listActivePromotions } from "@/services/promotionService";
import { toVN } from "@/lib/timezone";
import Card from "@/components/ui/Card";
import CopyCodeButton from "./CopyCodeButton";

// Dữ liệu đổi theo thời gian thực (lượt dùng, hạn) — không cache trang.
export const dynamic = "force-dynamic";

export default async function PromotionsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Promotions");

  await dbConnect();
  const promotions = await listActivePromotions();

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">{t("subtitle")}</p>
      </div>

      {promotions.length === 0 ? (
        <Card className="w-full max-w-3xl p-6 text-center text-sm text-ink/60">{t("empty")}</Card>
      ) : (
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
          {promotions.map((p) => (
            <Card key={p.code} className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-3xl font-bold text-coral-600">
                  {t("discount", { percent: p.discount_percent })}
                </p>
                <CopyCodeButton code={p.code} />
              </div>
              <p className="w-fit rounded-md border border-dashed border-sea-700/40 bg-white px-3 py-1 font-mono text-lg font-semibold tracking-widest text-sea-900">
                {p.code}
              </p>
              <div className="flex flex-col gap-0.5 text-xs text-ink/60">
                <p>{t("validUntil", { date: toVN(p.valid_until).format("HH:mm DD/MM/YYYY") })}</p>
                <p>{p.remaining === null ? t("unlimited") : t("remaining", { count: p.remaining })}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="w-full max-w-3xl text-xs text-ink/50">{t("howToUse")}</p>
    </div>
  );
}
