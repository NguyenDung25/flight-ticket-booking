"use client";

import { useState } from "react";
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

const ICONS = {
  bag: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 7h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z",
  suitcase: "M9 6V4h6v2M6 6h12v13H6zM9 10v6M15 10v6",
  meal: "M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9",
  refund: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
};

function Icon({ name }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-sea-700">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function FlightCard({ flight, locale, leg, searchContext, fareInfo, priceClass = "economy", t }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("fares");

  // airline.name là object {vi, en} (models/Airline.js) — không phải string.
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

  const priceEconomy = flight.base_price.economy;
  // Giá hiển thị trên thẻ theo hạng vé đang lọc (bộ lọc chỉ để lại chuyến có bán hạng đó).
  const showBusiness = priceClass === "business" && flight.base_price.business != null;
  const headerPrice = showBusiness ? flight.base_price.business : priceEconomy;
  const hasBusiness = flight.base_price.business !== undefined && flight.base_price.business !== null;
  const totalAvailable = flight.available_seats.economy + (hasBusiness ? flight.available_seats.business ?? 0 : 0);
  const soldOut = totalAvailable === 0;
  const passengerCount = Math.max(1, Number(searchContext.passengerCount) || 1);

  // Chọn hạng vé ngay tại đây; hạng đi kèm theo đường dẫn tới bước tóm tắt và chọn ghế.
  const id = String(flight._id);
  const nextHref = (seatClass) =>
    searchContext.tripType === "round_trip" && leg === "outbound"
      ? { pathname: "/search", query: { ...searchContext, outboundFlightId: id, outboundClass: seatClass } }
      : {
          pathname: "/booking/summary",
          query:
            searchContext.tripType === "round_trip"
              ? { ...searchContext, returnFlightId: id, returnClass: seatClass }
              : { ...searchContext, outboundFlightId: id, outboundClass: seatClass },
        };

  const fares = [
    { key: "economy", name: t("fareEconomy"), offered: true, price: priceEconomy, available: flight.available_seats.economy },
    { key: "business", name: t("fareBusiness"), offered: hasBusiness, price: flight.base_price.business, available: flight.available_seats.business ?? 0 },
  ];

  const benefits = (key) => {
    const info = fareInfo?.[key];
    if (!info) return [];
    return [
      { icon: "bag", text: t("fareCarryOn", { kg: info.carryOnKg }) },
      { icon: "suitcase", text: info.checkedKg > 0 ? t("fareChecked", { kg: info.checkedKg }) : t("fareCheckedNone") },
      { icon: "meal", text: info.mealIncluded ? t("fareMeal") : t("fareMealPaid", { price: CURRENCY_FORMATTER.format(info.mealPrice) }) },
      {
        icon: "refund",
        text: info.earlyCancelFee
          ? t("fareCancelFee", { hours: fareInfo.earlyHours, fee: CURRENCY_FORMATTER.format(info.earlyCancelFee) })
          : t("fareCancelFree", { hours: fareInfo.earlyHours }),
      },
    ];
  };

  return (
    <article className={`rounded-xl border bg-white transition-colors ${open ? "border-sea-500/40" : "border-sand-100 hover:border-sand-200"}`}>
      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[11rem_minmax(0,1fr)_12rem] md:items-center md:gap-6">
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
            <p className="text-xs text-ink/60">{showBusiness ? t("fareBusiness") : t("priceFrom")}</p>
            <p className="text-xl font-bold text-sea-500">{CURRENCY_FORMATTER.format(headerPrice)}đ</p>
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
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-coral-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-coral-600"
            >
              {t("selectFlight")}
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`transition-transform ${open ? "rotate-180" : ""}`}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-sand-100 px-5 pb-5">
          <div role="tablist" className="mx-auto flex max-w-md">
            {[
              ["fares", t("tabFares")],
              ["details", t("tabDetails")],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex-1 border-b-2 py-3 text-sm font-semibold transition-colors ${
                  tab === key ? "border-sea-500 text-sea-700" : "border-transparent text-ink/50 hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "fares" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {fares.map((fare) => (
                <div key={fare.key} className="flex flex-col rounded-xl border border-sand-100 p-4">
                  <p className="text-center text-xl font-bold text-ink">
                    {fare.offered ? `${CURRENCY_FORMATTER.format(fare.price)}đ` : "—"}
                  </p>
                  <p className="mt-1 text-center text-sm font-semibold text-sea-700">{fare.name}</p>
                  {fare.offered ? (
                    <>
                      <ul className="mt-4 flex flex-col gap-2 border-t border-sand-100 pt-3 text-sm text-ink/80">
                        {benefits(fare.key).map((b) => (
                          <li key={b.icon} className="flex gap-2">
                            <Icon name={b.icon} />
                            <span>{b.text}</span>
                          </li>
                        ))}
                      </ul>
                      <p className={`mt-3 text-xs ${fare.available <= LOW_SEATS ? "font-medium text-danger" : "text-ink/60"}`}>
                        {t("fareSeatsLeft", { count: fare.available })}
                      </p>
                      <div className="mt-auto pt-3">
                        {fare.available >= passengerCount ? (
                          <Link
                            href={nextHref(fare.key)}
                            className="flex h-10 w-full items-center justify-center rounded-lg bg-sea-700 text-sm font-semibold text-white transition-colors hover:bg-sea-900"
                          >
                            {t("fareSelect")}
                          </Link>
                        ) : (
                          <span className="flex h-10 w-full items-center justify-center rounded-lg bg-sand-100 text-sm font-medium text-ink/50">
                            {t("fareNotEnough", { count: passengerCount })}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="mt-4 border-t border-sand-100 pt-3 text-center text-sm text-ink/50">{t("fareNotOffered")}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <dl className="mx-auto mt-4 grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink/60">{t("detailFlight")}</dt>
              <dd className="font-medium text-ink">{airlineName} · {flight.flight_number}</dd>
              {flight.aircraft_name && (
                <>
                  <dt className="text-ink/60">{t("detailAircraft")}</dt>
                  <dd className="font-medium text-ink">{flight.aircraft_name}</dd>
                </>
              )}
              <dt className="text-ink/60">{t("detailDate")}</dt>
              <dd className="font-medium text-ink">{departure.format("DD/MM/YYYY")}</dd>
              <dt className="text-ink/60">{t("detailRoute")}</dt>
              <dd className="font-medium text-ink">
                {flight.origin_code} {departure.format("HH:mm")} → {flight.dest_code} {arrival.format("HH:mm")}
              </dd>
              <dt className="text-ink/60">{t("detailDuration")}</dt>
              <dd className="font-medium text-ink">{duration} · {t("direct")}</dd>
              <dd className="col-span-2 pt-1">
                <Link href="/cancellation-policy" className="text-sm font-medium text-sea-700 hover:underline">
                  {t("detailPolicy")}
                </Link>
              </dd>
            </dl>
          )}
        </div>
      )}
    </article>
  );
}
