"use client";

// app/[locale]/SearchForm.jsx
//
// C1 — form tìm chuyến bay. Validate CLIENT-SIDE trước khi điều hướng (khớp
// đúng 3 rule đầu của services/flightService.searchFlights — KHÔNG thay thế
// validate server, chỉ chặn sớm cho UX mượt hơn, /api/flights/search vẫn tự
// validate lại y hệt).
//
// Điều hướng bằng router.push() (KHÔNG dùng <form method="get">) để tự kiểm
// soát: ẩn hẳn returnDate khỏi query string khi one_way, thay vì gửi field
// rỗng lên rồi phải lọc ở phía nhận.
//
// LƯU Ý: /search (trang kết quả) CHƯA làm (Bước 3) — bấm submit lúc này sẽ
// ra 404, đúng như /my-bookings lúc Bước 0/1, không phải lỗi.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Button from "@/components/ui/Button";

const PASSENGER_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

// Ngày hôm nay theo giờ MÁY KHÁCH (YYYY-MM-DD). KHÔNG dùng toISOString(): nó ra
// ngày UTC nên từ 0h–7h sáng giờ VN sẽ lùi 1 ngày (min của ô ngày bị sai).
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * @param {Object} props
 * @param {Array<{code: string, name: {vi: string, en: string}, city: string}>} props.airports
 * @param {"vi"|"en"} props.locale
 */
export default function SearchForm({ airports, locale }) {
  const t = useTranslations("Home");
  const router = useRouter();

  // Khôi phục state từ sessionStorage khi đổi ngôn ngữ (locale thay đổi →
  // trang unmount/remount, useState bị reset). Lazy initializer chỉ đọc 1 lần
  // lúc mount. sessionStorage tự xoá khi đóng tab, tránh hiện lại dữ liệu cũ.
  function readSession(key, fallback) {
    try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  function saveSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch {}
  }

  const [tripType, setTripType] = useState(() => readSession("sf_tripType", "one_way"));
  const [origin, setOrigin] = useState(() => readSession("sf_origin", ""));
  const [destination, setDestination] = useState(() => readSession("sf_destination", ""));
  const [departureDate, setDepartureDate] = useState(() => readSession("sf_departureDate", todayISO()));
  const [returnDate, setReturnDate] = useState(() => readSession("sf_returnDate", ""));
  const [passengerCount, setPassengerCount] = useState(() => readSession("sf_passengerCount", "1"));
  const [formError, setFormError] = useState(null);

  function setTripTypeAndSave(v) { setTripType(v); saveSession("sf_tripType", v); }
  function setOriginAndSave(v) { setOrigin(v); saveSession("sf_origin", v); }
  function setDestinationAndSave(v) { setDestination(v); saveSession("sf_destination", v); }
  // Đổi ngày đi sang sau ngày về đã chọn -> xóa ngày về (tránh ngày về trước ngày đi).
  function setDepartureDateAndSave(v) {
    setDepartureDate(v);
    saveSession("sf_departureDate", v);
    if (returnDate && v && returnDate < v) {
      setReturnDate("");
      saveSession("sf_returnDate", "");
    }
  }
  function setReturnDateAndSave(v) { setReturnDate(v); saveSession("sf_returnDate", v); }
  function setPassengerCountAndSave(v) { setPassengerCount(v); saveSession("sf_passengerCount", v); }

  // Airport.city KHÔNG có bản dịch riêng (chỉ name.vi/name.en có) — dùng
  // name[locale] làm nhãn chính để dropdown thực sự đổi theo ngôn ngữ.
  const airportOptions = airports.map((a) => ({
    value: a.code,
    label: `${a.name[locale] ?? a.name.vi} (${a.code})`,
  }));

  function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);

    if (!origin || !destination) {
      setFormError(t("errorMissingRoute"));
      return;
    }
    if (origin === destination) {
      setFormError(t("errorSameAirport"));
      return;
    }
    // Ngày gõ tay hoặc khôi phục từ sessionStorage có thể vượt qua `min` của ô ngày.
    if (!departureDate || departureDate < todayISO()) {
      setFormError(t("errorDepartureInPast"));
      return;
    }
    if (tripType === "round_trip" && !returnDate) {
      setFormError(t("errorMissingReturnDate"));
      return;
    }
    if (tripType === "round_trip" && returnDate < departureDate) {
      setFormError(t("errorReturnBeforeDeparture"));
      return;
    }

    const params = new URLSearchParams({
      origin,
      destination,
      departureDate,
      tripType,
      passengerCount,
    });
    if (tripType === "round_trip") {
      params.set("returnDate", returnDate);
    }

    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-3xl rounded-2xl border border-sand-100 bg-white/70 p-6 shadow-sm"
    >
      <div className="mb-5 flex gap-2">
        {["one_way", "round_trip"].map((tt) => (
          <button
            key={tt}
            type="button"
            onClick={() => setTripTypeAndSave(tt)}
            aria-pressed={tripType === tt}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tripType === tt
                ? "bg-sea-900 text-white"
                : "bg-sand-100 text-sea-900 hover:bg-sand-200"
            }`}
          >
            {tt === "one_way" ? t("tripTypeOneWay") : t("tripTypeRoundTrip")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label={t("from")}
          placeholder="—"
          value={origin}
          onChange={(e) => setOriginAndSave(e.target.value)}
          options={airportOptions}
        />
        <Select
          label={t("to")}
          placeholder="—"
          value={destination}
          onChange={(e) => setDestinationAndSave(e.target.value)}
          options={airportOptions}
        />
      </div>

      {/* Hàng ngày bay + số khách TÁCH RIÊNG khỏi lưới From/To ở trên, và số
          cột tự đổi theo tripType (2 cột one_way, 3 cột round_trip) — để
          "Số khách" LUÔN nằm cùng hàng với ngày bay thay vì rơi xuống hàng
          riêng một mình khi round_trip (5 field lẻ trong 1 lưới 2 cột cố
          định sẽ để passengers mồ côi 1 mình, nhìn lệch — đây chính là bug
          UI đã sửa). Cũng tránh việc bật/tắt round_trip làm "Số khách" nhảy
          vị trí đột ngột giữa 2 layout khác hẳn nhau. */}
      <div
        className={`mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 ${
          tripType === "round_trip" ? "md:grid-cols-3" : ""
        }`}
      >
        <DatePicker
          label={t("departureDate")}
          value={departureDate}
          min={todayISO()}
          onChange={(e) => setDepartureDateAndSave(e.target.value)}
        />
        {tripType === "round_trip" && (
          <DatePicker
            label={t("returnDate")}
            value={returnDate}
            min={departureDate || todayISO()}
            onChange={(e) => setReturnDateAndSave(e.target.value)}
          />
        )}
        <Select
          label={t("passengers")}
          value={passengerCount}
          onChange={(e) => setPassengerCountAndSave(e.target.value)}
          options={PASSENGER_OPTIONS}
        />
      </div>

      {formError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" className="mt-5 w-full sm:w-auto">
        {t("searchButton")}
      </Button>
    </form>
  );
}
