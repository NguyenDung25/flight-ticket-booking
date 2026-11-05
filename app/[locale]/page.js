import fs from "node:fs";
import path from "node:path";
import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import Airport from "@/models/Airport";
import { Link } from "@/i18n/navigation";
import { todayStringVN } from "@/lib/timezone";
import SearchForm from "./SearchForm";
import PopularRoutesGrid from "@/components/home/PopularRoutesGrid";
import { getAncillaryPricing } from "@/services/ancillaryPricingService";
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
  // Lưới 2 hàng: tối đa 8 tuyến (4 thẻ mỗi hàng trên máy tính).
  const routeCards = buildRouteCards({ stats: routeStats, locale, todayStr: today, routes: homeRoutes }).slice(0, 8).map((c) => ({
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

  // Mục "Dịch vụ bổ sung": số liệu lấy từ bảng giá dịch vụ admin đang áp dụng.
  const pricing = await getAncillaryPricing();
  const vnd = (n) => `${Number(n).toLocaleString("vi-VN")}đ`;
  const packages = pricing.baggage_packages ?? [];
  const services = [
    {
      key: "baggage",
      title: t("serviceBaggageTitle"),
      desc: packages.length
        ? t("serviceBaggageDesc", {
            minKg: packages[0].kg,
            maxKg: packages[packages.length - 1].kg,
            price: vnd(Math.min(...packages.map((p) => p.price))),
          })
        : t("serviceBaggageNone"),
    },
    {
      key: "meal",
      title: t("serviceMealTitle"),
      desc: pricing.meal_included?.economy
        ? t("serviceMealIncluded")
        : t("serviceMealDesc", { price: vnd(pricing.meal_price?.economy ?? 0) }),
    },
    { key: "seat", title: t("serviceSeatTitle"), desc: t("serviceSeatDesc") },
    {
      key: "business",
      title: t("serviceBusinessTitle"),
      desc: t(pricing.meal_included?.business ? "serviceBusinessDesc" : "serviceBusinessDescNoMeal", {
        kg: pricing.included_checked_kg?.business ?? 0,
      }),
    },
  ];

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
      {/* === Hero: ảnh máy bay nguyên bản; chữ trắng có bóng mờ để không bị chìm vào ảnh === */}
      <section className="relative overflow-hidden bg-sea-900">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/images/hero.jpg)" }}
        />
        {/* Dải tối nhẹ chỉ ở mép trái (chỗ có chữ) vì mặt trời trong ảnh nằm ngay sau dòng tiêu đề */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 via-50% to-transparent to-75%" />
        <div className="relative mx-auto max-w-6xl px-6 pb-32 pt-14 text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.55)] sm:pb-36 sm:pt-20">
          <p className="mb-3 text-sm font-semibold text-white/90">{t("heroEyebrow", { count: airports.length })}</p>
          <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/90 sm:text-lg">{t("heroSubtitle")}</p>
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
          <PopularRoutesGrid
            cards={routeCards}
            labels={{
              from: t("routeFrom"),
              oneWay: t("routeOneWay"),
              buyNow: t("routeBuyNow"),
              region: t("popularRoutesTitle"),
            }}
          />
          <p className="mt-3 text-xs text-ink/60">{t("routePriceNote")}</p>
        </section>
      )}

      {/* === Dịch vụ bổ sung === */}
      <section aria-labelledby="home-services" className="mx-auto w-full max-w-6xl px-6 pt-14">
        <h2 id="home-services" className="mb-6 text-2xl font-bold tracking-tight text-ink">{t("servicesTitle")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {services.map((s) => (
            <li key={s.key} className="group relative h-64 overflow-hidden rounded-2xl bg-ink sm:h-80">
              {/* Ảnh phủ kín ô, tối dần ở nửa dưới để chữ trắng dễ đọc */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                style={{ backgroundImage: `url(/images/services/${s.key}.jpg)`, backgroundPosition: s.key === "baggage" ? "30% center" : "center" }}
              />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3 sm:p-5">
                <h3 className="text-sm font-semibold text-white sm:text-lg">
                  {/* after: phủ cả thẻ -> bấm bất kỳ đâu trên thẻ đều mở trang giới thiệu dịch vụ */}
                  <Link
                    href={`/services/${s.key}`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-coral-500"
                  >
                    {s.title}
                  </Link>
                </h3>
                <p className="text-xs leading-relaxed text-white/85 sm:text-sm">{s.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

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
