import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { getFlightDetail, FlightError } from "@/services/flightService";
import { Link } from "@/i18n/navigation";
import User from "@/models/User";
import PassengersForm from "./PassengersForm";
import { getAncillaryPricing } from "@/services/ancillaryPricingService";

/** Mongoose doc -> plain JSON an toàn để truyền qua Client Component. */
function toPlainFlight(doc, currentUserId) {
  const plain = JSON.parse(JSON.stringify(doc));
  const now = Date.now();
  return {
    ...plain,
    seats: plain.seats.map((s) => {
      // Ghế `held` đã quá hạn coi như trống (cron có thể chưa kịp nhả) — server holdSeat cũng vậy.
      const expired = s.status === "held" && s.held_until && new Date(s.held_until).getTime() < now;
      return {
        seat_number: s.seat_number,
        seat_class: s.seat_class,
        status: expired ? "available" : s.status,
        held_by_me: !expired && s.status === "held" && String(s.held_by) === String(currentUserId),
      };
    }),
  };
}

export default async function BookingPassengersPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("BookingSummary"); // tái dùng message lỗi tham số/chuyến bay
  const tCommon = await getTranslations("Common");

  const session = await auth();
  const sp = await searchParams;
  const tripType = sp.tripType === "round_trip" ? "round_trip" : "one_way";
  const passengerCount = Math.max(1, Number(sp.passengerCount) || 1);
  const outboundFlightId = sp.outboundFlightId;
  const returnFlightId = sp.returnFlightId;

  if (!outboundFlightId || (tripType === "round_trip" && !returnFlightId)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{t("errorMissingParams")}</p>
        <Link href="/" className="text-sm font-medium text-sea-500 hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  await dbConnect();

  // Email chưa xác thực -> chưa cho chọn ghế.
  const me = await User.findById(session.user.id).select("email_verified").lean();
  if (me?.email_verified === false) {
    const tAccount = await getTranslations("Account");
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="max-w-md text-ink/80">{tAccount("verifyBeforeBooking")}</p>
        <Link href="/account" className="text-sm font-medium text-sea-500 hover:underline">
          {tAccount("goToAccount")}
        </Link>
      </div>
    );
  }

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
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{errorMessage ?? t("errorNotFound")}</p>
        <Link href="/" className="text-sm font-medium text-sea-500 hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <PassengersForm
      locale={locale}
      pricing={JSON.parse(JSON.stringify(await getAncillaryPricing()))}
      defaultContactEmail={session.user.email ?? ""}
      tripType={tripType}
      initialPassengerCount={passengerCount}
      outboundFlight={toPlainFlight(outbound, session.user.id)}
      returnFlight={returnFlight ? toPlainFlight(returnFlight, session.user.id) : null}
    />
  );
}
