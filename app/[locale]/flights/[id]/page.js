import { getTranslations, getLocale, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { getFlightDetail, FlightError } from "@/services/flightService";
import { localizeApiMessage } from "@/lib/apiMessages";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import { toVN } from "@/lib/timezone";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

function formatDuration(departure, arrival) {
  const minutesTotal = arrival.diff(departure, "minute");
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
}

function countAvailable(seats, seatClass) {
  return seats.filter((s) => s.seat_class === seatClass && s.status === "available").length;
}

export default async function FlightDetailPage({ params, searchParams }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("FlightDetail");
  const tCommon = await getTranslations("Common");

  await dbConnect();

  let flight = null;
  let errorMessage = null;
  try {
    flight = await getFlightDetail(id);
  } catch (err) {
    // Log lỗi thật ra terminal — nếu không, lỗi không phải FlightError.
    console.error("FlightDetailPage error:", err);
    errorMessage = err instanceof FlightError ? localizeApiMessage(err.message, locale) : tCommon("error");
  }

  if (errorMessage || !flight) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{errorMessage}</p>
        <Link href="/" className="text-sm font-medium text-sea-500 hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  // searchContext mang theo nguyên vẹn xuyên suốt wizard — spread lại y hệt những gì FlightCard đã gửi qua.
  const searchContext = {
    origin: sp.origin,
    destination: sp.destination,
    departureDate: sp.departureDate,
    tripType: sp.tripType,
    returnDate: sp.returnDate,
    passengerCount: sp.passengerCount,
  };
  const leg = sp.leg; // "outbound" | "return", chỉ có ý nghĩa khi tripType round_trip
  const passengerCount = Math.max(1, Number(sp.passengerCount) || 1);

  // Khách chọn hạng ghế ngay tại đây (mỗi chặng một hạng); hạng đi kèm theo đường dẫn tới bước chọn ghế.
  const nextHref = (seatClass) =>
    searchContext.tripType === "round_trip" && leg === "outbound"
      ? { pathname: "/search", query: { ...searchContext, outboundFlightId: id, outboundClass: seatClass } }
      : {
          pathname: "/booking/summary",
          query:
            searchContext.tripType === "round_trip"
              ? {
                  ...searchContext,
                  outboundFlightId: sp.outboundFlightId,
                  outboundClass: sp.outboundClass,
                  returnFlightId: id,
                  returnClass: seatClass,
                }
              : { ...searchContext, outboundFlightId: id, outboundClass: seatClass },
        };

  const airlineName = flight.airline_id.name[locale] ?? flight.airline_id.name.vi;
  const departure = toVN(flight.departure_time);
  const arrival = toVN(flight.arrival_time);

  const economyAvailable = countAvailable(flight.seats, "economy");
  const businessAvailable = countAvailable(flight.seats, "business");
  const hasBusiness = flight.base_price.business !== undefined && flight.base_price.business !== null;
  // Đúng công thức FlightCard.jsx đã dùng ở trang kết quả tìm kiếm — hết chỗ nghĩa là cả 2 hạng ghế.
  const totalAvailable = economyAvailable + (hasBusiness ? businessAvailable : 0);
  const soldOut = totalAvailable === 0;

  const classRows = [
    { key: "economy", label: t("economyLabel"), offered: true, available: economyAvailable, price: flight.base_price.economy },
    { key: "business", label: t("businessLabel"), offered: hasBusiness, available: businessAvailable, price: flight.base_price.business },
  ];

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-2xl">
        <Link href={{ pathname: "/search", query: searchContext }} className="text-sm font-medium text-sea-700 hover:underline">
          ← {tCommon("back")}
        </Link>
      </div>

      <Card className="w-full max-w-2xl p-6">
        <p className="text-sm font-medium text-sea-700">
          {airlineName} · {flight.flight_number} · {flight.aircraft_id.name}
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div>
            <p className="text-2xl font-semibold text-ink">
              {departure.format("HH:mm")}
            </p>
            <p className="text-sm text-ink/60">{flight.origin_code}</p>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1">
            <p className="text-xs text-ink/60">{t("duration")}</p>
            <div className="h-px w-full border-t border-dashed border-sand-200" />
            <p className="text-xs text-ink/60">{formatDuration(departure, arrival)}</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink">
              {arrival.format("HH:mm")}
            </p>
            <p className="text-sm text-ink/60">{flight.dest_code}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink/60">{departure.format("DD/MM/YYYY")}</p>

        <div className="mt-6 border-t border-sand-100 pt-4">
          <p className="mb-2 text-sm font-semibold text-ink">{t("seatClass")}</p>
          <div className="flex flex-col gap-2 text-sm">
            {classRows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-lg bg-white/60 px-3 py-2 sm:grid-cols-[1fr_auto_auto_6.5rem]"
              >
                <span className="font-medium text-ink">{row.label}</span>
                {row.offered ? (
                  <>
                    <span className="font-semibold text-coral-600 sm:order-3">
                      {CURRENCY_FORMATTER.format(row.price)}đ
                    </span>
                    <span className="text-ink/60 sm:order-2">
                      {t("availableSeatsLabel")}: {row.available}
                    </span>
                    {row.available >= passengerCount ? (
                      <Link
                        href={nextHref(row.key)}
                        className="inline-flex items-center justify-center rounded-lg bg-coral-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-600 sm:order-4"
                      >
                        {t("selectButton")}
                      </Link>
                    ) : (
                      <span className="text-center text-xs text-danger/70 sm:order-4">
                        {t("notEnoughSeats", { count: passengerCount })}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="col-span-1 text-ink/40 sm:col-span-3">{t("notOffered")}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {soldOut && (
          <span className="mt-6 inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-sand-100 px-5 py-3 text-sm font-medium text-danger/70">
            {t("soldOutLabel")}
          </span>
        )}
      </Card>
    </div>
  );
}
