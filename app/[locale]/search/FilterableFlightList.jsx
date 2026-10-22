"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import FlightCard from "./FlightCard";

const TIME_SLOTS = [
  { id: "early", labelKey: "timeSlotEarly", startHour: 0, endHour: 6 },
  { id: "morning", labelKey: "timeSlotMorning", startHour: 6, endHour: 12 },
  { id: "afternoon", labelKey: "timeSlotAfternoon", startHour: 12, endHour: 18 },
  { id: "evening", labelKey: "timeSlotEvening", startHour: 18, endHour: 24 },
];

function departureHourVN(isoString) {
  // Giờ khởi hành hiển thị trên FlightCard luôn quy đổi giờ VN (toVN).
  const hour = new Date(isoString).toLocaleString("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    hour12: false,
  });
  return Number(hour) % 24;
}

export default function FilterableFlightList({ flights, locale, leg, searchContext, fareInfo, dateLabel = "" }) {
  // useTranslations (hook client-safe của next-intl) — không nhận `t` qua props từ page.js.
  const t = useTranslations("SearchResults");

  // Bộ lọc giá, sắp xếp theo giá và giá trên thẻ chuyến bay đều theo hạng vé đang chọn.
  const [fareClass, setFareClass] = useState("economy");
  const priceOf = (f) => (fareClass === "business" ? f.base_price.business ?? null : f.base_price.economy);
  const hasAnyBusiness = flights.some((f) => f.base_price.business != null);
  const classFlights = flights.filter((f) => priceOf(f) != null);
  const prices = classFlights.map(priceOf);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPriceOverall = prices.length > 0 ? Math.max(...prices) : 0;

  const airlineOptions = useMemo(() => {
    const map = new Map();
    for (const f of flights) {
      const id = String(f.airline._id);
      if (!map.has(id)) {
        map.set(id, f.airline.name[locale] ?? f.airline.name.vi);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [flights, locale]);

  // sessionStorage — giữ bộ lọc khi đổi ngôn ngữ (trang unmount/remount).
  const FILTER_KEY = `fl_filter_${leg ?? "outbound"}`;
  function readFilter(key, fallback) {
    try {
      const v = sessionStorage.getItem(FILTER_KEY + "_" + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  }
  function saveFilter(key, value) {
    try { sessionStorage.setItem(FILTER_KEY + "_" + key, JSON.stringify(value)); } catch {}
  }

  const [maxPrice, setMaxPrice] = useState(maxPriceOverall);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [selectedAirlines, setSelectedAirlines] = useState([]);
  const [sortBy, setSortBy] = useState("time");

  // Render lần đầu bằng giá trị mặc định (giống server — server không đọc được sessionStorage).
  useEffect(() => {
    const id = setTimeout(() => {
      const savedClass = readFilter("class", "economy") === "business" && hasAnyBusiness ? "business" : "economy";
      setFareClass(savedClass);
      const classPrices = flights
        .map((f) => (savedClass === "business" ? f.base_price.business : f.base_price.economy))
        .filter((p) => p != null);
      const lo = classPrices.length ? Math.min(...classPrices) : 0;
      const hi = classPrices.length ? Math.max(...classPrices) : 0;
      const savedMax = readFilter("maxPrice", hi);
      setMaxPrice(savedMax >= lo && savedMax <= hi ? savedMax : hi);
      setSelectedSlots(readFilter("slots", []));
      setSelectedAirlines(readFilter("airlines", []));
      setSortBy(readFilter("sort", "time"));
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSlot(id) {
    setSelectedSlots((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      saveFilter("slots", next);
      return next;
    });
  }
  function toggleAirline(id) {
    setSelectedAirlines((prev) => {
      const next = prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id];
      saveFilter("airlines", next);
      return next;
    });
  }
  function changeFareClass(next) {
    if (next === fareClass) return;
    const nextPrices = flights
      .map((f) => (next === "business" ? f.base_price.business : f.base_price.economy))
      .filter((p) => p != null);
    const hi = nextPrices.length ? Math.max(...nextPrices) : 0;
    setFareClass(next); saveFilter("class", next);
    setMaxPrice(hi); saveFilter("maxPrice", hi);
  }
  function resetFilters() {
    const economyMax = Math.max(...flights.map((f) => f.base_price.economy));
    setFareClass("economy"); saveFilter("class", "economy");
    setMaxPrice(economyMax); saveFilter("maxPrice", economyMax);
    setSelectedSlots([]); saveFilter("slots", []);
    setSelectedAirlines([]); saveFilter("airlines", []);
  }

  const filtered = flights.filter((f) => {
    const price = priceOf(f);
    if (price == null || price > maxPrice) return false;

    if (selectedAirlines.length > 0 && !selectedAirlines.includes(String(f.airline._id))) {
      return false;
    }

    if (selectedSlots.length > 0) {
      const hour = departureHourVN(f.departure_time);
      const matchesAnySlot = TIME_SLOTS.some(
        (slot) => selectedSlots.includes(slot.id) && hour >= slot.startHour && hour < slot.endHour
      );
      if (!matchesAnySlot) return false;
    }

    return true;
  });

  // Sắp xếp: mặc định theo giờ bay (server đã sắp sẵn), hoặc giá thấp nhất của hạng vé đang chọn.
  const sorted =
    sortBy === "price"
      ? [...filtered].sort((a, b) => priceOf(a) - priceOf(b) || new Date(a.departure_time) - new Date(b.departure_time))
      : filtered;

  const isFilterActive =
    fareClass !== "economy" || maxPrice !== maxPriceOverall || selectedSlots.length > 0 || selectedAirlines.length > 0;

  if (flights.length === 0) {
    return (
      <p className="rounded-xl border border-sand-100 bg-white p-6 text-sm text-ink/70">{t("noResults")}</p>
    );
  }

  const checkboxRow = "flex cursor-pointer items-center gap-2.5 text-sm text-ink";

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Bộ lọc: cột trái trên màn hình lớn, khối trên cùng trên điện thoại */}
      <aside
        aria-label={t("filtersTitle")}
        className="flex flex-col gap-5 rounded-xl border border-sand-100 bg-white p-5 lg:w-64 lg:shrink-0"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold text-ink">{t("filtersTitle")}</h2>
          {isFilterActive && (
            <button type="button" onClick={resetFilters} className="text-sm font-medium text-sea-500 hover:underline">
              {t("filterResetButton")}
            </button>
          )}
        </div>

        {hasAnyBusiness && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-ink">{t("filterClassLabel")}</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-sand-50 p-1">
              {[
                ["economy", t("fareEconomy")],
                ["business", t("fareBusiness")],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={fareClass === key}
                  onClick={() => changeFareClass(key)}
                  className={`h-9 rounded-md text-sm font-medium transition-colors ${
                    fareClass === key ? "bg-white text-sea-700 shadow-sm" : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor={`price-${leg}`} className="text-sm font-semibold text-ink">
            {t("filterPriceLabel", { price: new Intl.NumberFormat("vi-VN").format(maxPrice) })}
          </label>
          <input
            id={`price-${leg}`}
            type="range"
            min={minPrice}
            max={maxPriceOverall}
            step={Math.max(1000, Math.round((maxPriceOverall - minPrice) / 20))}
            value={maxPrice}
            onChange={(e) => { const v = Number(e.target.value); setMaxPrice(v); saveFilter("maxPrice", v); }}
            className="w-full accent-coral-500"
            disabled={minPrice === maxPriceOverall}
          />
        </div>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-sm font-semibold text-ink">{t("filterTimeLabel")}</legend>
          {TIME_SLOTS.map((slot) => (
            <label key={slot.id} className={checkboxRow}>
              <input
                type="checkbox"
                checked={selectedSlots.includes(slot.id)}
                onChange={() => toggleSlot(slot.id)}
                className="h-4 w-4 accent-coral-500"
              />
              {t(slot.labelKey)}
            </label>
          ))}
        </fieldset>

        {airlineOptions.length > 1 && (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-sm font-semibold text-ink">{t("filterAirlineLabel")}</legend>
            {airlineOptions.map((a) => (
              <label key={a.id} className={checkboxRow}>
                <input
                  type="checkbox"
                  checked={selectedAirlines.includes(a.id)}
                  onChange={() => toggleAirline(a.id)}
                  className="h-4 w-4 accent-coral-500"
                />
                {a.name}
              </label>
            ))}
          </fieldset>
        )}
      </aside>

      <section aria-label={t("title")} className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink/60">
          <p>
            <span className="font-semibold text-ink">{t("resultsCount", { count: sorted.length })}</span>
            {dateLabel && <span className="first-letter:uppercase"> · {dateLabel}</span>}
          </p>
          <label className="flex items-center gap-2">
            {t("sortLabel")}
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); saveFilter("sort", e.target.value); }}
              className="h-9 rounded-lg border border-sand-200 bg-white px-2 text-sm text-ink"
            >
              <option value="time">{t("sortEarliest")}</option>
              <option value="price">{t("sortCheapest")}</option>
            </select>
          </label>
        </div>

        {sorted.length === 0 ? (
          <p className="rounded-xl border border-sand-100 bg-white p-6 text-sm text-ink/70">{t("noResultsAfterFilter")}</p>
        ) : (
          sorted.map((flight) => (
            <FlightCard
              key={flight._id}
              flight={flight}
              locale={locale}
              leg={leg}
              searchContext={searchContext}
              fareInfo={fareInfo}
              priceClass={fareClass}
              t={t}
            />
          ))
        )}
      </section>
    </div>
  );
}
