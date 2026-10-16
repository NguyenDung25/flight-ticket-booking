"use client";

// app/[locale]/search/FilterableFlightList.jsx
//
// C2 — lọc phía CLIENT trên danh sách đã có sẵn từ server (KHÔNG gọi lại
// API/DB khi đổi bộ lọc — đúng đặc tả C2 trong chuc-nang-he-thong.md: lọc là
// thao tác tức thời trên kết quả C1 đã trả về, không phải 1 lượt search
// mới). Nhận `flights` đã serialize sẵn (plain JSON, không còn ObjectId/Date
// thô) từ page.js.
//
// FlightCard vẫn là Server Component thuần (không "use client") — render
// được bình thường từ trong Client Component này vì bản thân nó không dùng
// API nào chỉ có ở server (chỉ dùng lib/timezone + next-intl Link, cả 2 đều
// chạy được ở browser).

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import FlightCard from "./FlightCard";

const TIME_SLOTS = [
  { id: "early", labelKey: "timeSlotEarly", startHour: 0, endHour: 6 },
  { id: "morning", labelKey: "timeSlotMorning", startHour: 6, endHour: 12 },
  { id: "afternoon", labelKey: "timeSlotAfternoon", startHour: 12, endHour: 18 },
  { id: "evening", labelKey: "timeSlotEvening", startHour: 18, endHour: 24 },
];

function departureHourVN(isoString) {
  // Giờ khởi hành hiển thị trên FlightCard LUÔN quy đổi giờ VN (toVN) —
  // khung giờ lọc ở đây PHẢI tính theo đúng giờ VN đó, không phải giờ UTC
  // thô lưu trong DB, nếu không 1 chuyến hiện "08:00" trên thẻ có thể lại bị
  // xếp nhầm khung "Đêm khuya" nếu tính theo UTC — cùng nguyên tắc múi giờ
  // đã áp dụng xuyên suốt dự án (xem lib/timezone.js).
  const hour = new Date(isoString).toLocaleString("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    hour12: false,
  });
  return Number(hour) % 24;
}

export default function FilterableFlightList({ flights, locale, leg, searchContext, dateLabel = "" }) {
  // useTranslations (hook CLIENT-safe của next-intl) — KHÔNG nhận `t` qua
  // props từ page.js: getTranslations() phía server trả về 1 HÀM, mà hàm
  // không truyền được qua ranh giới Server Component -> Client Component
  // (Next.js sẽ throw lỗi ngay). FlightCard vẫn nhận `t` qua props như cũ —
  // hợp lệ ở đây vì lúc này cả 2 đều đã nằm trong client tree (chỉ props từ
  // SERVER component crossing vào CLIENT component mới bị cấm truyền hàm).
  const t = useTranslations("SearchResults");

  const prices = flights.map((f) => f.base_price.economy);
  const minPrice = flights.length > 0 ? Math.min(...prices) : 0;
  const maxPriceOverall = flights.length > 0 ? Math.max(...prices) : 0;

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
  // Key gắn với leg để không nhầm giữa bộ lọc chặng đi và chặng về (khứ hồi).
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

  const [maxPrice, setMaxPrice] = useState(() => readFilter("maxPrice", maxPriceOverall));
  const [selectedSlots, setSelectedSlots] = useState(() => readFilter("slots", []));
  const [selectedAirlines, setSelectedAirlines] = useState(() => readFilter("airlines", []));
  const [sortBy, setSortBy] = useState(() => readFilter("sort", "time"));

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
  function resetFilters() {
    setMaxPrice(maxPriceOverall); saveFilter("maxPrice", maxPriceOverall);
    setSelectedSlots([]); saveFilter("slots", []);
    setSelectedAirlines([]); saveFilter("airlines", []);
  }

  const filtered = flights.filter((f) => {
    if (f.base_price.economy > maxPrice) return false;

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

  // Sắp xếp: mặc định theo giờ bay (server đã sắp sẵn), hoặc giá phổ thông thấp nhất.
  const sorted =
    sortBy === "price"
      ? [...filtered].sort((a, b) => a.base_price.economy - b.base_price.economy || new Date(a.departure_time) - new Date(b.departure_time))
      : filtered;

  const isFilterActive =
    maxPrice !== maxPriceOverall || selectedSlots.length > 0 || selectedAirlines.length > 0;

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
              t={t}
            />
          ))
        )}
      </section>
    </div>
  );
}
