// app/[locale]/page.js — C1: trang tìm kiếm chuyến bay.
// Trang chủ gồm 3 phần: Hero banner, SearchForm, và 2 section bên dưới
// (tuyến bay phổ biến + lý do chọn DelayX).

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

  // Ngày hôm nay theo giờ VN (KHÔNG dùng toISOString(): ra ngày UTC nên 0h–7h sáng
  // giờ VN bị lùi 1 ngày -> link dẫn tới ngày quá khứ và searchFlights từ chối).
  const today = todayStringVN();

  // Khối "Tuyến bay phổ biến": danh sách/thứ tự/ảnh do admin quản lý (Admin → Chuyến bay → Tuyến phổ biến;
  // chưa tùy chỉnh thì dùng mặc định trong lib/popularRoutes.js). Giá thấp nhất + chuyến gần nhất lấy từ DB
  // (chuyến scheduled chưa bay). Ảnh: ưu tiên ảnh admin tải lên (MongoDB), rồi ảnh trong
  // public/images/routes/<mã>.jpg, cuối cùng là hình SVG dự phòng.
  const homeRoutes = await listForHome();
  const routeStats = await getRouteStats(homeRoutes.map((r) => [r.origin_code, r.dest_code]));
  const routeCards = buildRouteCards({ stats: routeStats, locale, todayStr: today, routes: homeRoutes }).map((c) => ({
    ...c,
    title: t("routeTitle", { from: c.fromCity, to: c.toCity }),
    nextLabel: c.nextTime ? t("routeNextFlight", { time: c.nextTime }) : t("routeNoFlights"),
    imageSrc:
      c.dbImageUrl ?? resolveRouteImage(c.to, (rel) => fs.existsSync(path.join(process.cwd(), "public", rel))),
  }));

  const whyUs = [
    {
      icon: "✈️",
      title_vi: "Bay thẳng không nối chuyến",
      title_en: "Direct flights, no layovers",
      desc_vi: "Kết nối các đảo và thành phố lớn Việt Nam trực tiếp, tiết kiệm thời gian.",
      desc_en: "Direct connections between Vietnam's islands and major cities — no wasted time.",
    },
    {
      icon: "💺",
      title_vi: "Chọn ghế theo ý muốn",
      title_en: "Choose your own seat",
      desc_vi: "Sơ đồ ghế trực quan, chọn ghế ngay khi đặt vé không mất thêm phí.",
      desc_en: "Intuitive seat map — pick your seat at booking with no extra fees.",
    },
    {
      icon: "📱",
      title_vi: "Check-in online dễ dàng",
      title_en: "Easy online check-in",
      desc_vi: "Check-in từ 24 giờ trước khởi hành, nhận boarding pass điện tử ngay trên điện thoại.",
      desc_en: "Check in from 24 hours before departure and get your boarding pass on your phone.",
    },
    {
      icon: "🔒",
      title_vi: "Thanh toán bảo mật",
      title_en: "Secure payments",
      desc_vi: "Tích hợp cổng thanh toán VNPay, đảm bảo giao dịch an toàn và nhanh chóng.",
      desc_en: "Integrated VNPay payment gateway for fast, secure transactions.",
    },
  ];

  return (
    <div className="flex flex-col flex-1 bg-sand-50">
      {/* === HERO === */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-coral-600 px-6 py-20 text-center text-white sm:py-28">
        {/* gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#f08a46] via-[#dd6120] to-[#b8430f]" />
        {/* decorative circles */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-white/20 blur-2xl" />

        <div className="relative z-10 flex flex-col items-center gap-6">
          <span className="rounded-full border border-white/40 bg-white/15 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-white">
            DelayX
          </span>
          <h1 className="font-display max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="max-w-xl text-base font-medium text-white sm:text-lg">
            {t("heroSubtitle")}
          </p>

          {/* Search Form nằm trong hero */}
          <div className="mt-4 w-full max-w-3xl text-left text-ink">
            <SearchForm airports={airports} locale={locale} />
          </div>
        </div>
      </section>

      {/* === TUYẾN BAY PHỔ BIẾN === */}
      {routeCards.length > 0 && (
      <section className="mx-auto w-full max-w-6xl px-6 py-14">
        <h2 className="mb-8 font-display text-2xl font-semibold text-sea-900">
          {t("popularRoutesTitle")}
        </h2>
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
        <p className="mt-3 text-xs text-ink/60">{t("routePriceNote")}</p>
      </section>
      )}

      {/* === LÝ DO CHỌN === */}
      <section className="border-t border-sand-100 bg-white px-6 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-10 font-display text-center text-2xl font-semibold text-sea-900">
            {t("whyUsTitle")}
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {whyUs.map((item) => (
              <div
                key={item.icon}
                className="flex flex-col items-center gap-3 rounded-xl border border-sand-100 bg-sand-50 px-5 py-7 text-center"
              >
                <span className="text-4xl">{item.icon}</span>
                <h3 className="font-semibold text-sea-900">
                  {locale === "vi" ? item.title_vi : item.title_en}
                </h3>
                <p className="text-sm leading-relaxed text-ink/60">
                  {locale === "vi" ? item.desc_vi : item.desc_en}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
