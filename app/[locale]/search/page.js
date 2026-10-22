import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { searchFlights, getFlightDetail, getDailyMinPrices, FlightError } from "@/services/flightService";
import Airport from "@/models/Airport";
import { localizeApiMessage } from "@/lib/apiMessages";
import "dayjs/locale/vi";
import { toVN, todayStringVN, dayRangeVN } from "@/lib/timezone";
import { Link } from "@/i18n/navigation";
import FilterableFlightList from "./FilterableFlightList";
import { getAncillaryPricing } from "@/services/ancillaryPricingService";
import { CANCELLATION_FEES, CANCELLATION_FULL_REFUND_THRESHOLD_HOURS } from "@/config/constants";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

// Quyền lợi của từng hạng vé hiển thị trên thẻ chọn giá vé: lấy từ bảng giá dịch vụ và cấu hình phí hủy hiện hành.
async function fareInfoFor() {
  const p = await getAncillaryPricing();
  const cls = (c) => ({
    carryOnKg: p.carry_on_kg,
    checkedKg: p.included_checked_kg?.[c] ?? 0,
    mealIncluded: Boolean(p.meal_included?.[c]),
    mealPrice: p.meal_price?.[c] ?? 0,
    earlyCancelFee: CANCELLATION_FEES[c].early,
  });
  return { economy: cls("economy"), business: cls("business"), earlyHours: CANCELLATION_FULL_REFUND_THRESHOLD_HOURS };
}

export default async function SearchResultsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("SearchResults");
  const tCommon = await getTranslations("Common");

  const sp = await searchParams;
  const origin = sp.origin;
  const destination = sp.destination;
  const departureDate = sp.departureDate;
  const tripType = sp.tripType || "one_way";
  const returnDate = sp.returnDate;
  const passengerCount = sp.passengerCount ? Number(sp.passengerCount) : undefined;

  // Có mặt outboundFlightId + đang tìm khứ hồi => đây là bước 2 của wizard — chỉ hiện chặng về.
  const isReturnStep = tripType === "round_trip" && Boolean(sp.outboundFlightId);

  let result = null;
  let errorMessage = null;
  let selectedOutbound = null;

  try {
    await dbConnect();
    result = await searchFlights({ origin, destination, departureDate, tripType, returnDate, passengerCount });

    if (isReturnStep) {
      // Chỉ để hiển thị dải xác nhận — lỗi ở đây (VD flight vừa bị admin hủy giữa chừng) không được làm sập cả trang.
      try {
        selectedOutbound = await getFlightDetail(sp.outboundFlightId);
      } catch {
        selectedOutbound = null;
      }

      // Luật nghiệp vụ: khứ hồi phải cùng 1 hãng bay cả 2 chiều.
      if (selectedOutbound && result.return) {
        const outboundAirlineId = String(selectedOutbound.airline_id._id);
        // Ghi chú (z): lọc bỏ chặng về cất cánh trước outbound.arrival_time + 2h ngay ở UI.
        const outboundArrivalMs = new Date(selectedOutbound.arrival_time).getTime();
        const MIN_TRANSIT_MS = 2 * 60 * 60 * 1000; // 2 tiếng tính bằng ms

        result = {
          ...result,
          return: result.return.filter((flight) => {
            const sameAirline = String(flight.airline._id) === outboundAirlineId;
            const validTransit =
              new Date(flight.departure_time).getTime() >= outboundArrivalMs + MIN_TRANSIT_MS;
            return sameAirline && validTransit;
          }),
        };
      }
    }
  } catch (err) {
    // FlightError (thiếu/sai tham số) -> message đã được service viết sẵn, an toàn hiển thị thẳng.
    console.error("SearchPage error:", err);
    errorMessage = err instanceof FlightError ? localizeApiMessage(err.message, locale) : tCommon("error");
  }

  // Mang nguyên vẹn ngữ cảnh tìm kiếm.
  const searchContext = {
    origin,
    destination,
    departureDate,
    tripType,
    returnDate,
    passengerCount: sp.passengerCount,
    outboundFlightId: sp.outboundFlightId,
    outboundClass: sp.outboundClass,
  };

  // Serialize sang plain JSON trước khi đưa vào FilterableFlightList (Client Component).
  const airportDocs = origin && destination
    ? await Airport.find({ code: { $in: [String(origin).toUpperCase(), String(destination).toUpperCase()] } }, "code name").lean()
    : [];
  const airportName = (code) => {
    const a = airportDocs.find((x) => x.code === String(code ?? "").toUpperCase());
    return a ? `${a.name[locale] ?? a.name.vi} (${a.code})` : code;
  };
  const legFrom = isReturnStep ? destination : origin;
  const legTo = isReturnStep ? origin : destination;

  // Dải chọn ngày: 7 ngày quanh ngày đang xem (không lùi về trước hôm nay).
  const currentDate = isReturnStep ? returnDate : departureDate;
  // "YYYY-MM-DD" -> ngày đó theo giờ VN (qua dayRangeVN: không lệch ngày nếu server chạy múi giờ khác).
  const dayLocale = locale === "en" ? "en" : "vi";
  const vnDay = (ymd) => toVN(dayRangeVN(ymd).start).locale(dayLocale);
  let dateStrip = [];
  if (result && currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
    const today = todayStringVN();
    let startDay = vnDay(currentDate).subtract(3, "day");
    if (startDay.format("YYYY-MM-DD") < today) startDay = vnDay(today);
    const dates = Array.from({ length: 7 }, (_, i) => startDay.add(i, "day").format("YYYY-MM-DD"));
    const minPrices = await getDailyMinPrices({ origin: legFrom, destination: legTo, dates }).catch(() => ({}));
    dateStrip = dates.map((d) => {
      const query = { ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined)) };
      if (isReturnStep) {
        query.returnDate = d;
      } else {
        query.departureDate = d;
        if (tripType === "round_trip" && returnDate && returnDate < d) query.returnDate = d;
      }
      return {
        date: d,
        label: vnDay(d).format(locale === "en" ? "ddd, DD/MM" : "dd, DD/MM"),
        price: minPrices[d] != null ? `${CURRENCY_FORMATTER.format(minPrices[d])}đ` : "—",
        selected: d === currentDate,
        disabled: isReturnStep && d < departureDate,
        href: { pathname: "/search", query },
      };
    });
  }

  const outboundFlights = result ? JSON.parse(JSON.stringify(result.outbound)) : [];
  const returnFlights = result ? JSON.parse(JSON.stringify(result.return ?? [])) : [];

  const editSearchHref = {
    pathname: "/",
    query: { origin, destination, departureDate, tripType, returnDate, passengerCount: sp.passengerCount },
  };

  return (
    <div className="flex flex-1 flex-col bg-sand-50">
      {/* Thanh tóm tắt hành trình */}
      <div className="border-b border-sand-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-bold text-ink sm:text-xl">
            <span>{airportName(legFrom)}</span>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-sea-500">
              <path d="M4 12h16M14 6l6 6-6 6" />
            </svg>
            <span>{airportName(legTo)}</span>
          </h1>
          <p className="text-sm text-ink/60">
            {tripType === "round_trip" ? t("roundTrip") : t("oneWay")} · {t("passengersCount", { count: Number(sp.passengerCount) || 1 })}
          </p>
          <Link
            href={editSearchHref}
            className="flex h-10 items-center gap-2 rounded-lg border border-sand-200 px-4 text-sm font-medium text-ink hover:border-ink/40 sm:ml-auto"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4L19 9l-4-4L4 16v4z" />
            </svg>
            {t("backToSearch")}
          </Link>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-6">
        {tripType === "round_trip" && (
          <p className="text-sm font-semibold text-sea-500">
            {isReturnStep ? t("stepReturnTitle") : t("stepOutboundTitle")}
          </p>
        )}

        {dateStrip.length > 0 && (
          <nav aria-label={t("dateStripLabel")} className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
            <ul className="grid min-w-[42rem] grid-cols-7">
              {dateStrip.map((d) => (
                <li key={d.date} className="border-r border-sand-100 last:border-r-0">
                  {d.disabled ? (
                    <span className="block px-2 py-3 text-center text-ink/40">
                      <span className="block text-xs">{d.label}</span>
                      <span className="mt-1 block text-sm">—</span>
                    </span>
                  ) : (
                    <Link
                      href={d.href}
                      aria-current={d.selected ? "date" : undefined}
                      className={`block px-2 py-3 text-center transition-colors ${
                        d.selected ? "bg-sea-50 shadow-[inset_0_-2px_0_var(--color-coral-500)]" : "hover:bg-sand-50"
                      }`}
                    >
                      <span className="block text-xs text-ink/60">{d.label}</span>
                      <span className={`mt-1 block text-sm font-semibold ${d.price === "—" ? "text-ink/40" : "text-ink"}`}>{d.price}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        {isReturnStep && selectedOutbound && (
          <div className="rounded-xl border border-sand-100 bg-white p-4">
            <p className="text-sm font-semibold text-ink">{t("selectedOutboundLabel")}</p>
            <p className="mt-1 text-sm text-ink/80">
              {selectedOutbound.flight_number} · {selectedOutbound.origin_code} → {selectedOutbound.dest_code} ·{" "}
              {toVN(selectedOutbound.departure_time).format("HH:mm DD/MM")} ·{" "}
              {CURRENCY_FORMATTER.format(selectedOutbound.base_price.economy)}đ
            </p>
            <p className="mt-1 text-xs text-ink/60">
              {t("sameAirlineNote", {
                airline: selectedOutbound.airline_id.name[locale] ?? selectedOutbound.airline_id.name.vi,
              })}
            </p>
          </div>
        )}

        {result && (
          <FilterableFlightList
            flights={isReturnStep ? returnFlights : outboundFlights}
            locale={locale}
            leg={isReturnStep ? "return" : "outbound"}
            searchContext={searchContext}
            fareInfo={await fareInfoFor()}
            dateLabel={currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate) ? vnDay(currentDate).format("dddd, DD/MM/YYYY") : ""}
          />
        )}
      </div>
    </div>
  );
}
