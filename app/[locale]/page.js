import fs from "node:fs";
import path from "node:path";
import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import Airport from "@/models/Airport";
import { Link } from "@/i18n/navigation";
import { todayStringVN } from "@/lib/timezone";
import SearchForm from "./SearchForm";
import PopularRoutesCarousel from "@/components/home/PopularRoutesCarousel";
import { getRouteStats } from "@/services/routeStatsService";
import { listForHome } from "@/services/popularRouteService";
import { buildRouteCards, resolveRouteImage } from "@/lib/popularRoutes";
import { CANCELLATION_FEES } from "@/config/constants";
import { listActivePromotions } from "@/services/promotionService";
import { toVN } from "@/lib/timezone";
import CopyCodeButton from "./promotions/CopyCodeButton";

export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  await dbConnect();
  const airportDocs = await Airport.find({}, "code name city country")
    .sort({ city: 1 })
    .lean();
  const airports = airportDocs.map((a) => ({
    code: a.code,
    name: { vi: a.name.vi, en: a.name.en },
    city: a.city,
  }));

  // Ngày hôm nay theo giờ VN (không dùng toISOString.
  const today = todayStringVN();

  // Khối "Tuyến bay phổ biến": danh sách/thứ tự/ảnh do admin quản lý.
  const homeRoutes = await listForHome();
  const routeStats = await getRouteStats(homeRoutes.map((r) => [r.origin_code, r.dest_code]));
  const routeCards = buildRouteCards({ stats: routeStats, locale, todayStr: today, routes: homeRoutes }).map((c) => ({
    ...c,
    title: t("routeTitle", { from: c.fromCity, to: c.toCity }),
    nextLabel: c.nextTime ? t("routeNextFlight", { time: c.nextTime }) : t("routeNoFlights"),
    imageSrc:
      c.dbImageUrl ?? resolveRouteImage(c.to, (rel) => fs.existsSync(path.join(process.cwd(), "public", rel))),
  }));

  // Mục "Ưu đãi đang áp dụng": tối đa 3 mã còn hạn + còn lượt (sắp hết hạn trước); không có mã nào thì ẩn mục.
  const tPromo = await getTranslations("Promotions");
  const promotions = (await listActivePromotions().catch(() => [])).slice(0, 3).map((p) => ({
    code: p.code,
    percent: p.discount_percent,
    // valid_until lưu 00:00 VN của ngày kế tiếp -> trừ 1ms ra ngày cuối còn hiệu lực (như trang Khuyến mãi).
    until: toVN(new Date(new Date(p.valid_until).getTime() - 1)).format("DD/MM/YYYY"),
    left: p.remaining === null ? tPromo("unlimited") : tPromo("remaining", { count: p.remaining }),
  }));

  // Icon nét (stroke) cho phần "điểm nổi bật" — vẽ SVG, không dùng emoji.
  const featureIcons = {
    seat: <path d="M5 11V6a2 2 0 012-2h10a2 2 0 012 2v5M3 11h18v5H3zM6 16v4M18 16v4" />,
    qr: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />,
    lock: <path d="M5 11h14v10H5zM8 11V7a4 4 0 018 0v4" />,
    refund: <path d="M4 4v6h6M20 12a8 8 0 01-14.3 4.9M4 12a8 8 0 0114.3-4.9" />,
  };
  const features = ["seat", "qr", "lock", "refund"].map((key, i) => ({
    key,
    title: t(`feature${i + 1}Title`),
    desc: t(`feature${i + 1}Desc`, { fee: CANCELLATION_FEES.economy.early.toLocaleString("vi-VN") }),
  }));

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* === Hero: minh họa phẳng (núi, mặt trời, đường bay) — không gradient, không vòng tròn mờ === */}
      <section className="relative overflow-hidden bg-sea-50">
        <svg
          aria-hidden="true"
          viewBox="0 0 1280 470"
          preserveAspectRatio="xMidYMax slice"
          className="absolute inset-0 h-full w-full"
        >
          <circle cx="1040" cy="150" r="70" fill="#f9c79a" />
          <path d="M0 360 L180 280 L300 330 L470 240 L620 320 L760 260 L900 330 L1060 250 L1280 330 L1280 470 L0 470 Z" fill="#f3d3b8" />
          <path d="M0 410 L220 340 L420 395 L640 330 L860 400 L1080 350 L1280 400 L1280 470 L0 470 Z" fill="#e9b990" />
          <path d="M140 210 C 420 60, 760 60, 1110 190" fill="none" stroke="#c9764a" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" />
          <path d="M0 8 L34 0 L0 -8 L7 0 Z" transform="translate(905 92) rotate(18)" fill="#9a3412" />
        </svg>
        <div className="relative mx-auto max-w-6xl px-6 pb-32 pt-14 sm:pb-36 sm:pt-20">
          <p className="mb-3 text-sm font-semibold text-sea-500">{t("heroEyebrow", { count: airports.length })}</p>
          <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-ink/70 sm:text-lg">{t("heroSubtitle")}</p>
        </div>
      </section>

      {/* === Form tìm chuyến: thẻ trắng đè lên mép dưới hero === */}
      <section aria-label={t("searchButton")} className="relative mx-auto -mt-24 w-full max-w-6xl px-6">
        {/* Form rộng tối đa 3xl, canh giữa trang */}
        <SearchForm airports={airports} locale={locale} />
      </section>

      {/* === Ưu đãi đang áp dụng (thẻ gọn 1 hàng) === */}
      {promotions.length > 0 && (
        <section aria-labelledby="home-promos" className="mx-auto w-full max-w-6xl px-6 pt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="home-promos" className="text-2xl font-bold tracking-tight text-ink">{t("promosTitle")}</h2>
            <Link href="/promotions" className="text-sm font-semibold text-sea-500 hover:underline">
              {t("promosAll")}
            </Link>
          </div>
          <p className="mb-5 mt-1.5 text-sm text-ink/70">{t("promosNote")}</p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {promotions.map((p) => (
              <li key={p.code} className="flex items-center gap-3 rounded-xl border border-sand-100 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2.5">
                    <span className="font-mono text-[17px] font-bold tracking-wider text-ink">{p.code}</span>
                    <span className="rounded-md bg-sea-50 px-2 py-0.5 text-xs font-bold text-sea-500">-{p.percent}%</span>
                  </p>
                  <p className="mt-1 truncate text-xs text-ink/60">
                    {t("promoUntil", { date: p.until })} · {p.left}
                  </p>
                </div>
                <CopyCodeButton code={p.code} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* === Tuyến bay phổ biến === */}
      {routeCards.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 pt-14">
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-ink">{t("popularRoutesTitle")}</h2>
          <PopularRoutesCarousel
            cards={routeCards}
            labels={{
              from: t("routeFrom"),
              oneWay: t("routeOneWay"),
              buyNow: t("routeBuyNow"),
              prev: t("routePrev"),
              next: t("routeNext"),
              region: t("popularRoutesTitle"),
            }}
          />
          <p className="mt-2 text-xs text-ink/60">{t("routePriceNote")}</p>
        </section>
      )}

      {/* === Điểm nổi bật === */}
      <section aria-labelledby="why-us" className="mt-14 border-t border-sand-100 bg-sand-50 py-12">
        <div className="mx-auto mb-8 max-w-6xl px-6">
          <h2 id="why-us" className="text-2xl font-bold tracking-tight text-ink">{t("whyUsTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">{t("whyUsIntro")}</p>
        </div>
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.key} className="flex flex-col gap-2">
              <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-sea-500">
                {featureIcons[f.key]}
              </svg>
              <h3 className="mt-1 text-base font-semibold text-ink">{f.title}</h3>
              <p className="text-sm leading-relaxed text-ink/70">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
