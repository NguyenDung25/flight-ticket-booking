"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { normalizeBookingCode, normalizePassengerName } from "@/lib/bookingCode";
import { CHECKIN_PREFILL_KEY } from "./check-in/CheckInLookup";
import Select from "@/components/ui/Select";
import DatePicker from "@/components/ui/DatePicker";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const PASSENGER_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

// Ngày hôm nay theo giờ máy khách (YYYY-MM-DD).
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SearchForm({ airports, locale }) {
  const t = useTranslations("Home");
  const router = useRouter();

  // Khôi phục state từ sessionStorage khi đổi ngôn ngữ.
  function readSession(key, fallback) {
    try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  function saveSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch {}
  }

  const [tripType, setTripType] = useState("one_way");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState(todayISO);
  const [returnDate, setReturnDate] = useState("");
  const [passengerCount, setPassengerCount] = useState("1");

  // Render lần đầu bằng giá trị mặc định (giống server — server không đọc được sessionStorage).
  useEffect(() => {
    const id = setTimeout(() => {
      setTripType(readSession("sf_tripType", "one_way"));
      setOrigin(readSession("sf_origin", ""));
      setDestination(readSession("sf_destination", ""));
      setDepartureDate(readSession("sf_departureDate", todayISO()));
      setReturnDate(readSession("sf_returnDate", ""));
      setPassengerCount(readSession("sf_passengerCount", "1"));
    }, 0);
    return () => clearTimeout(id);
  }, []);
  const [formError, setFormError] = useState(null);
  // Tab của ô tìm kiếm: đặt vé | quản lý đặt chỗ | làm thủ tục (như trang các hãng bay).
  const [mode, setMode] = useState("book");
  const [ciCode, setCiCode] = useState("");
  const [ciName, setCiName] = useState("");
  const [ciError, setCiError] = useState(null);

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

  // Airport.city không có bản dịch riêng (chỉ name.vi/name.en có).
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

  // Đổi chiều điểm đi <-> điểm đến (nút tròn giữa 2 ô, như các trang đặt vé thật).
  function swapRoute() {
    const o = origin;
    setOriginAndSave(destination);
    setDestinationAndSave(o);
  }

  // Tab "Làm thủ tục": kiểm tra sơ bộ rồi chuyển sang trang Check-in, trang đó tự tra cứu.
  function handleCheckIn(e) {
    e.preventDefault();
    const code = normalizeBookingCode(ciCode);
    if (!code) return setCiError(t("ciCodeInvalid"));
    if (!normalizePassengerName(ciName)) return setCiError(t("ciNameRequired"));
    try { sessionStorage.setItem(CHECKIN_PREFILL_KEY, ciName.trim()); } catch {}
    router.push({ pathname: "/check-in", query: { code } });
  }

  const TABS = [
    { id: "book", label: t("tabBook"), icon: <path d="M16 10h4a2 2 0 010 4h-4l-4 7H9l2-7H7l-2 2H2l2-4-2-4h3l2 2h4L9 3h3l4 7z" /> },
    { id: "manage", label: t("tabManage"), icon: <path d="M3 7h18v10H3zM15 7v10" /> },
    { id: "checkin", label: t("tabCheckIn"), icon: <path d="M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2" /> },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-sand-100 bg-white">
      <div role="tablist" aria-label={t("tabsLabel")} className="grid grid-cols-3 border-b border-sand-100">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`home-tab-${tab.id}`}
            aria-selected={mode === tab.id}
            aria-controls={`home-panel-${tab.id}`}
            onClick={() => setMode(tab.id)}
            className={`flex h-14 items-center justify-center gap-2 border-b-[3px] px-2 text-sm transition-colors sm:text-[15px] ${
              mode === tab.id
                ? "border-coral-500 bg-white font-bold text-ink"
                : "border-transparent bg-sand-50 font-medium text-ink/60 hover:text-ink"
            }`}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="hidden shrink-0 sm:block">
              {tab.icon}
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "manage" && (
        <div role="tabpanel" id="home-panel-manage" aria-labelledby="home-tab-manage" className="p-6">
          <p className="text-sm text-ink/70">{t("manageDesc")}</p>
          <Link
            href="/my-bookings"
            className="mt-5 inline-flex h-11 items-center rounded-lg bg-coral-500 px-5 text-sm font-semibold text-white hover:bg-coral-600"
          >
            {t("manageButton")}
          </Link>
        </div>
      )}

      {mode === "checkin" && (
        <form role="tabpanel" id="home-panel-checkin" aria-labelledby="home-tab-checkin" onSubmit={handleCheckIn} className="p-6">
          <p className="mb-4 text-sm text-ink/70">{t("checkInDesc")}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Input
              label={t("ciCodeLabel")}
              placeholder={t("ciCodePlaceholder")}
              value={ciCode}
              onChange={(e) => { setCiCode(e.target.value.toUpperCase()); setCiError(null); }}
              maxLength={10}
              autoComplete="off"
            />
            <Input
              label={t("ciNameLabel")}
              placeholder={t("ciNamePlaceholder")}
              value={ciName}
              onChange={(e) => { setCiName(e.target.value); setCiError(null); }}
              maxLength={80}
              autoComplete="family-name"
            />
            <Button type="submit" className="h-11">{t("ciButton")}</Button>
          </div>
          {ciError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {ciError}
            </p>
          )}
        </form>
      )}

      {mode === "book" && (
    <form role="tabpanel" id="home-panel-book" aria-labelledby="home-tab-book" onSubmit={handleSubmit} className="p-6">
      <div className="mb-5 flex gap-2">
        {["one_way", "round_trip"].map((tt) => (
          <button
            key={tt}
            type="button"
            onClick={() => setTripTypeAndSave(tt)}
            aria-pressed={tripType === tt}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tripType === tt ? "bg-ink text-white" : "bg-sand-100 text-ink hover:bg-sand-200"
            }`}
          >
            {tt === "one_way" ? t("tripTypeOneWay") : t("tripTypeRoundTrip")}
          </button>
        ))}
      </div>

      {/* Điểm đi | nút đổi chiều | Điểm đến */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end sm:gap-4">
        <Select
          label={t("from")}
          placeholder={t("chooseAirport")}
          value={origin}
          onChange={(e) => setOriginAndSave(e.target.value)}
          options={airportOptions.filter((o) => o.value !== destination)}
        />
        <button
          type="button"
          onClick={swapRoute}
          aria-label={t("swapRoute")}
          title={t("swapRoute")}
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-sand-200 bg-white text-ink transition-colors hover:border-ink/40"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 sm:rotate-0">
            <path d="M7 7h13l-4-4M17 17H4l4 4" />
          </svg>
        </button>
        <Select
          label={t("to")}
          placeholder={t("chooseAirport")}
          value={destination}
          onChange={(e) => setDestinationAndSave(e.target.value)}
          options={airportOptions.filter((o) => o.value !== origin)}
        />
      </div>

      {/* Hàng ngày bay + số khách: 2 cột khi một chiều, 3 cột khi khứ hồi — "Số khách" luôn cùng hàng với ngày bay. */}
      <div className={`mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 ${tripType === "round_trip" ? "md:grid-cols-3" : ""}`}>
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
      )}
    </div>
  );
}
