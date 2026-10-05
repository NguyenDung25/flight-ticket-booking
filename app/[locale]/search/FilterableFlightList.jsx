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

export default function FilterableFlightList({ flights, locale, leg, searchContext }) {
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

  const [maxPrice, setMaxPrice] = useState(maxPriceOverall);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [selectedAirlines, setSelectedAirlines] = useState([]);

  function toggleSlot(id) {
    setSelectedSlots((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }
  function toggleAirline(id) {
    setSelectedAirlines((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }
  function resetFilters() {
    setMaxPrice(maxPriceOverall);
    setSelectedSlots([]);
    setSelectedAirlines([]);
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

  const isFilterActive =
    maxPrice !== maxPriceOverall || selectedSlots.length > 0 || selectedAirlines.length > 0;

  if (flights.length === 0) {
    return <p className="text-sm text-ink/60">{t("noResults")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-6 rounded-xl border border-sand-100 bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">
            {t("filterPriceLabel", { price: new Intl.NumberFormat("vi-VN").format(maxPrice) })}
          </label>
          <input
            type="range"
            min={minPrice}
            max={maxPriceOverall}
            step={Math.max(1000, Math.round((maxPriceOverall - minPrice) / 20))}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="w-48 accent-sea-500"
            disabled={minPrice === maxPriceOverall}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink/60">{t("filterTimeLabel")}</span>
          <div className="flex flex-wrap gap-2">
            {TIME_SLOTS.map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => toggleSlot(slot.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedSlots.includes(slot.id)
                    ? "border-sea-500 bg-sea-500 text-white"
                    : "border-sand-100 bg-white text-ink/70 hover:border-sea-500"
                }`}
              >
                {t(slot.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {airlineOptions.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink/60">{t("filterAirlineLabel")}</span>
            <div className="flex flex-wrap gap-2">
              {airlineOptions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAirline(a.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selectedAirlines.includes(a.id)
                      ? "border-sea-500 bg-sea-500 text-white"
                      : "border-sand-100 bg-white text-ink/70 hover:border-sea-500"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {isFilterActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto self-center text-xs font-medium text-coral-600 hover:underline"
          >
            {t("filterResetButton")}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink/60">{t("noResultsAfterFilter")}</p>
      ) : (
        filtered.map((flight) => (
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
    </div>
  );
}
