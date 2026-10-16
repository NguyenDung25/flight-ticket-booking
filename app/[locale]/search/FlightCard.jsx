// app/[locale]/search/FlightCard.jsx
//
// 1 chuyến bay trong danh sách kết quả (C1/C2), bố cục hàng ngang như các trang đặt vé thật:
// hãng + số hiệu | giờ đi — thời gian bay — giờ đến | giá phổ thông + nút "Chọn chuyến".
// Nút dẫn sang trang chi tiết (C3), mang theo TOÀN BỘ ngữ cảnh tìm kiếm + `leg` qua query string để
// trang chi tiết biết đang chọn chặng nào của lần tìm kiếm nào (khứ hồi: chọn chặng đi xong quay lại
// chọn chặng về, không mất ngữ cảnh).

import { Link } from "@/i18n/navigation";
import { toVN } from "@/lib/timezone";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");
// Dưới ngưỡng này hiện cảnh báo "chỉ còn N chỗ" màu đỏ.
const LOW_SEATS = 5;

// Ô mã hãng: màu nền theo hãng (không có logo thật, dùng mã IATA cho dễ nhận).
const AIRLINE_TONES = {
  VN: "bg-[#e3ecf5] text-[#1e3a5f]",
  VJ: "bg-[#fbe4e1] text-[#8a1c12]",
  QH: "bg-[#e3f1e8] text-[#1f5135]",
  VU: "bg-[#efe6f5] text-[#4a2a6a]",
  "9G": "bg-[#fff1d6] text-[#6b4a00]",
};

export default function FlightCard({ flight, locale, leg, searchContext, t }) {
  // airline.name là object {vi, en} (models/Airline.js) — KHÔNG phải string.
  const airlineName = flight.airline.name[locale] ?? flight.airline.name.vi;
  const airlineCode = (flight.airline.code ?? flight.flight_number.slice(0, 2)).toUpperCase();

  const departure = toVN(flight.departure_time);
  const arrival = toVN(flight.arrival_time);
  const minutes = Math.max(0, Math.round(arrival.diff(departure, "minute", true)));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const duration = m === 0 ? t("durationHours", { h }) : t("duration", { h, m: String(m).padStart(2, "0") });
  // Đến vào ngày hôm sau (bay qua nửa đêm) -> ghi "+1" cạnh giờ đến.
  const nextDay = arrival.format("YYYY-MM-DD") !== departure.format("YYYY-MM-DD");

  // Giá phổ thông là giá tham khảo trên danh sách; giá từng hạng ghế xem ở trang chi tiết (C3).
  const priceEconomy = flight.base_price.economy;
  const totalAvailable = flight.available_seats.economy + (flight.available_seats.business ?? 0);
  const soldOut = totalAvailable === 0;

  const detailHref = {
    pathname: `/flights/${String(flight._id)}`,
    query: { ...searchContext, leg },
  };

  return (
    <article className="grid grid-cols-1 gap-4 rounded-xl border border-sand-100 bg-white p-5 transition-colors hover:border-sand-200 md:grid-cols-[11rem_minmax(0,1fr)_12rem] md:items-center md:gap-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${
            AIRLINE_TONES[airlineCode] ?? "bg-sand-100 text-ink"
          }`}
        >
          {airlineCode}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{airlineName}</span>
          <span className="text-sm text-ink/60">{flight.flight_number}</span>
        </span>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
        <span>
          <span className="block text-2xl font-bold text-ink">{departure.format("HH:mm")}</span>
          <span className="text-sm text-ink/60">{flight.origin_code}</span>
        </span>
        <span className="flex flex-col items-center gap-1.5 text-xs text-ink/60">
          {duration}
          <span aria-hidden="true" className="relative block h-px w-full bg-sand-200">
            <span className="absolute -top-[3px] right-0 h-[7px] w-[7px] rounded-full bg-sand-200" />
          </span>
          {t("direct")}
        </span>
        <span className="text-right">
          <span className="block text-2xl font-bold text-ink">
            {arrival.format("HH:mm")}
            {nextDay && <sup className="ml-0.5 text-xs font-semibold text-sea-500">+1</sup>}
          </span>
          <span className="text-sm text-ink/60">{flight.dest_code}</span>
        </span>
      </div>

      <div className="flex flex-row items-center justify-between gap-3 border-t border-sand-100 pt-4 md:flex-col md:items-end md:border-l md:border-t-0 md:pl-6 md:pt-0">
        <div className="md:text-right">
          <p className="text-xs text-ink/60">{t("economyFrom")}</p>
          <p className="text-xl font-bold text-sea-500">{CURRENCY_FORMATTER.format(priceEconomy)}đ</p>
          <p className={`text-xs ${soldOut || totalAvailable <= LOW_SEATS ? "font-medium text-danger" : "text-ink/60"}`}>
            {soldOut
              ? t("seatsSoldOut")
              : totalAvailable <= LOW_SEATS
                ? t("seatsLow", { count: totalAvailable })
                : t("seatsAvailable", { count: totalAvailable })}
          </p>
        </div>
        {soldOut ? (
          <span className="inline-flex h-10 items-center rounded-lg bg-sand-100 px-5 text-sm font-medium text-ink/50">
            {t("seatsSoldOut")}
          </span>
        ) : (
          <Link
            href={detailHref}
            className="inline-flex h-10 items-center rounded-lg bg-coral-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-coral-600"
          >
            {t("selectFlight")}
          </Link>
        )}
      </div>
    </article>
  );
}
