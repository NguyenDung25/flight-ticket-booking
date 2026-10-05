// app/[locale]/booking/summary/page.js
//
// C3 bước 3 — tóm tắt hành trình (1 hoặc 2 chặng đã chọn ở bước 1/2, xem
// nextHref trong app/[locale]/flights/[id]/page.js) + tổng tiền TẠM TÍNH
// theo giá economy (chưa chốt — hạng ghế thật của từng khách chỉ biết sau
// C5). Route nằm trong PROTECTED_SEGMENTS (proxy.js, segment "booking") —
// BẮT BUỘC đăng nhập mới xem được, đúng mục "Bắt buộc đăng nhập mới đặt
// được vé" (mục 1, tổng quan) — chặn sớm từ bước xem tóm tắt, không đợi C6.

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { getFlightDetail, FlightError } from "@/services/flightService";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import { toVN } from "@/lib/timezone";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

function FlightRow({ flight, locale, label }) {
  const airlineName = flight.airline_id.name[locale] ?? flight.airline_id.name.vi;
  const departure = toVN(flight.departure_time);
  const arrival = toVN(flight.arrival_time);

  return (
    <div className="rounded-lg bg-white/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sea-700">{label}</p>
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
    // Log lỗi THẬT ra terminal trước — không có dòng này, mọi lỗi không
    // phải FlightError bị nuốt hoàn toàn, không cách nào debug được.
    console.error("BookingFlowPage error:", err);
    errorMessage = err instanceof FlightError ? t("errorNotFound") : tCommon("error");
  }

  if (errorMessage || !outbound) {
    return <ErrorState message={errorMessage ?? t("errorNotFound")} backLabel={tCommon("back")} />;
  }

  // Tạm tính = economy × số khách, mỗi chặng — CHƯA chốt (ghi rõ trong UI
  // qua estimatedTotalNote), giá thật tính lại ở services/bookingValidationService
  // khi tạo booking (C6) dựa trên seat_class THẬT từng khách chọn ở C5.
  const estimatedTotal =
    outbound.base_price.economy * passengerCount +
    (returnFlight ? returnFlight.base_price.economy * passengerCount : 0);

  const nextHref = {
    pathname: "/booking/passengers",
    query: {
      tripType,
      passengerCount: String(passengerCount),
      outboundFlightId,
      ...(returnFlightId ? { returnFlightId } : {}),
    },
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-sea-700">
          {t("stepLabel")}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-sea-900">{t("title")}</h1>
      </div>

      <Card className="w-full max-w-2xl p-6">
        <div className="flex flex-col gap-3">
          <FlightRow flight={outbound} locale={locale} label={t("outboundLabel")} />
          {returnFlight && (
            <FlightRow flight={returnFlight} locale={locale} label={t("returnLabel")} />
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
            {/* Ghi chú "tạm tính" đặt NGAY DƯỚI số tiền (trước đây nằm bên
                trái, cạnh số hành khách — tách rời trực quan khỏi con số nó
                đang giải thích, dễ bị đọc lướt qua và hiểu nhầm đây là giá
                cuối). */}
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
