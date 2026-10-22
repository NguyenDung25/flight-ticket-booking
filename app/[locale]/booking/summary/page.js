import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { getFlightDetail, FlightError } from "@/services/flightService";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import { toVN } from "@/lib/timezone";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

const seatClassParam = (value) => (value === "business" ? "business" : "economy");

function FlightRow({ flight, locale, label }) {
  const airlineName = flight.airline_id.name[locale] ?? flight.airline_id.name.vi;
  const departure = toVN(flight.departure_time);
  const arrival = toVN(flight.arrival_time);

  return (
    <div className="rounded-lg bg-white/60 p-4">
      <p className="text-sm font-semibold text-sea-700">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">
        {airlineName} · {flight.flight_number}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
        <span>
          {flight.origin_code} {departure.format("HH:mm")}
        </span>
        <span aria-hidden="true" className="text-ink/40">
          →
        </span>
        <span>
          {flight.dest_code} {arrival.format("HH:mm")}
        </span>
        <span className="text-ink/60">· {departure.format("DD/MM/YYYY")}</span>
      </div>
    </div>
  );
}

function ErrorState({ message, backLabel }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
      <p className="text-danger">{message}</p>
      <Link href="/" className="text-sm font-medium text-sea-500 hover:underline">
        {backLabel}
      </Link>
    </div>
  );
}

export default async function BookingSummaryPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("BookingSummary");
  const tCommon = await getTranslations("Common");

  const sp = await searchParams;
  const tripType = sp.tripType === "round_trip" ? "round_trip" : "one_way";
  const passengerCount = Math.max(1, Number(sp.passengerCount) || 1);
  const outboundFlightId = sp.outboundFlightId;
  const returnFlightId = sp.returnFlightId;

  if (!outboundFlightId || (tripType === "round_trip" && !returnFlightId)) {
    return <ErrorState message={t("errorMissingParams")} backLabel={tCommon("back")} />;
  }

  await dbConnect();

  let outbound = null;
  let returnFlight = null;
  let errorMessage = null;
  try {
    outbound = await getFlightDetail(outboundFlightId);
    if (tripType === "round_trip") {
      returnFlight = await getFlightDetail(returnFlightId);
    }
  } catch (err) {
    // Log lỗi thật ra terminal trước — không có dòng này, mọi lỗi không phải FlightError bị nuốt hoàn toàn.
    console.error("BookingFlowPage error:", err);
    errorMessage = err instanceof FlightError ? t("errorNotFound") : tCommon("error");
  }

  if (errorMessage || !outbound) {
    return <ErrorState message={errorMessage ?? t("errorNotFound")} backLabel={tCommon("back")} />;
  }

  // Hạng ghế khách đã chọn ở trang chi tiết; chuyến không bán hạng thương gia thì quay về phổ thông.
  const classFor = (flight, value) =>
    seatClassParam(value) === "business" && flight.base_price.business != null ? "business" : "economy";
  const outboundClass = classFor(outbound, sp.outboundClass);
  const returnClass = returnFlight ? classFor(returnFlight, sp.returnClass) : null;

  // Tổng giá vé theo hạng đã chọn; hành lý, suất ăn và khuyến mãi được cộng/trừ ở bước sau, server tính lại khi tạo đơn.
  const estimatedTotal =
    outbound.base_price[outboundClass] * passengerCount +
    (returnFlight ? returnFlight.base_price[returnClass] * passengerCount : 0);

  const nextHref = {
    pathname: "/booking/passengers",
    query: {
      tripType,
      passengerCount: String(passengerCount),
      outboundFlightId,
      outboundClass,
      ...(returnFlightId ? { returnFlightId, returnClass } : {}),
    },
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold text-sea-700">
          {t("stepLabel")}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
      </div>

      <Card className="w-full max-w-2xl p-6">
        <div className="flex flex-col gap-3">
          <FlightRow flight={outbound} locale={locale} label={`${t("outboundLabel")} · ${t(outboundClass)}`} />
          {returnFlight && (
            <FlightRow flight={returnFlight} locale={locale} label={`${t("returnLabel")} · ${t(returnClass)}`} />
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-sand-100 pt-4">
          <div>
            <p className="text-sm text-ink/60">
              {t("passengerCountLabel")}: {passengerCount}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink/60">{t("estimatedTotalLabel")}</p>
            <p className="text-xl font-semibold text-coral-600">
              {CURRENCY_FORMATTER.format(estimatedTotal)}đ
            </p>
            {/* Ghi chú "tạm tính" đặt ngay dưới số tiền. */}
            <p className="mt-1 max-w-[16rem] text-xs text-ink/50">{t("estimatedTotalNote")}</p>
          </div>
        </div>

        <Link
          href={nextHref}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-coral-500 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-coral-600"
        >
          {t("continueButton")}
        </Link>
      </Card>
    </div>
  );
}
