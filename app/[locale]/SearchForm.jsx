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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {Object} props
 * @param {Array<{code: string, name: {vi: string, en: string}, city: string}>} props.airports
 * @param {"vi"|"en"} props.locale
 */
export default function SearchForm({ airports, locale }) {
  const t = useTranslations("Home");
  const router = useRouter();

  const [tripType, setTripType] = useState("one_way");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState(todayISO());
  const [returnDate, setReturnDate] = useState("");
  const [passengerCount, setPassengerCount] = useState("1");
  const [formError, setFormError] = useState(null);

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
    if (tripType === "round_trip" && !returnDate) {
      setFormError(t("errorMissingReturnDate"));
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
            onClick={() => setTripType(tt)}
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
          onChange={(e) => setOrigin(e.target.value)}
          options={airportOptions}
        />
        <Select
          label={t("to")}
          placeholder="—"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          options={airportOptions}
        />
        <DatePicker
          label={t("departureDate")}
          value={departureDate}
          min={todayISO()}
          onChange={(e) => setDepartureDate(e.target.value)}
        />
        {tripType === "round_trip" && (
          <DatePicker
            label={t("returnDate")}
            value={returnDate}
            min={departureDate || todayISO()}
            onChange={(e) => setReturnDate(e.target.value)}
          />
        )}
        <Select
          label={t("passengers")}
          value={passengerCount}
          onChange={(e) => setPassengerCount(e.target.value)}
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
