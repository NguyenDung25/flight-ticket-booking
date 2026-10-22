import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CANCELLATION_FULL_REFUND_THRESHOLD_HOURS,
  CANCELLATION_FIXED_FEE_THRESHOLD_HOURS,
  CANCELLATION_FEES,
  SEAT_HOLD_DURATION_MINUTES,
  PAYMENT_EXPIRY_BUFFER_MINUTES,
  CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE,
  CHECK_IN_CLOSES_HOURS_BEFORE_DEPARTURE,
} from "@/config/constants";
import { getAncillaryPricing } from "@/services/ancillaryPricingService";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";

// Trang giới thiệu từng dịch vụ bổ sung (mở từ mục "Dịch vụ bổ sung" ở trang chủ).
const SERVICES = ["baggage", "meal", "seat", "business"];
const CLASSES = ["economy", "business"];

const vnd = (n) => `${Number(n).toLocaleString("vi-VN")}đ`;

function Section({ title, children }) {
  return (
    <Card className="w-full max-w-3xl p-6">
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink/80">{children}</div>
    </Card>
  );
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-sand-100">
      <table className="w-full min-w-[24rem] text-left text-sm">
        <thead className="bg-sand-50 text-xs text-ink/60">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-sand-100 align-top">
              {r.map((cell, i) => (
                <td key={i} className={`px-4 py-3 ${i === 0 ? "text-ink" : "text-ink/80"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Bullets = ({ items }) => (
  <ul className="list-disc space-y-1 pl-5">
    {items.map((x, i) => <li key={i}>{x}</li>)}
  </ul>
);

const Steps = ({ items }) => (
  <ol className="list-decimal space-y-1 pl-5">
    {items.map((x, i) => <li key={i}>{x}</li>)}
  </ol>
);

export default async function ServicePage({ params }) {
  const { locale, service } = await params;
  if (!SERVICES.includes(service)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Services");
  const pricing = await getAncillaryPricing();
  const packages = pricing.baggage_packages ?? [];
  const classLabel = (c) => t(c);
  const checkedText = (c) => (pricing.included_checked_kg[c] ? `${pricing.included_checked_kg[c]} kg` : t("notIncluded"));
  const mealText = (c) => (pricing.meal_included[c] ? t("mealIncluded") : vnd(pricing.meal_price[c]));
  const feeText = (amount) => (amount === 0 ? t("free") : amount === null ? t("loseAll") : vnd(amount));
  const full = CANCELLATION_FULL_REFUND_THRESHOLD_HOURS;
  const fixed = CANCELLATION_FIXED_FEE_THRESHOLD_HOURS;
  const cancelRows = [
    [t("cancelEarly", { hours: full }), "early"],
    [t("cancelMid", { from: fixed, to: full }), "mid"],
    [t("cancelLate", { hours: fixed }), "late"],
  ];
  // Ghi chú chung cho 2 dịch vụ mua thêm (hành lý, suất ăn).
  const paidNotes = [t("onlyWhenBooking"), t("promoNotApplied"), t("refundWithTicket")];

  const content = {
    baggage: (
      <>
        <Section title={t("baggageIncludedTitle")}>
          <Table
            head={[t("colClass"), t("colCarryOn"), t("colChecked")]}
            rows={CLASSES.map((c) => [classLabel(c), `${pricing.carry_on_kg} kg`, checkedText(c)])}
          />
        </Section>
        <Section title={t("baggagePackagesTitle")}>
          {packages.length ? (
            <Table head={[t("colPackage"), t("colPrice")]} rows={packages.map((p) => [`${p.kg} kg`, vnd(p.price)])} />
          ) : (
            <p>{t("baggageNone")}</p>
          )}
          <p>{t("baggagePerLeg")}</p>
          <p>{t("baggageAddsUp")}</p>
        </Section>
        <Section title={t("howToBuyTitle")}>
          <Steps items={[t("stepSearch"), t("baggageStep"), t("stepPay")]} />
        </Section>
        <Section title={t("notesTitle")}>
          <Bullets items={[...paidNotes, t("baggageAirlineRules")]} />
        </Section>
      </>
    ),
    meal: (
      <>
        <Section title={t("mealPriceTitle")}>
          <Table head={[t("colClass"), t("colMeal")]} rows={CLASSES.map((c) => [classLabel(c), mealText(c)])} />
          <p>{t("mealPerLeg")}</p>
        </Section>
        <Section title={t("howToBuyTitle")}>
          <Steps items={[t("stepSearch"), t("mealStep"), t("stepPay")]} />
        </Section>
        <Section title={t("specialMealTitle")}>
          <p>{t("specialMealIntro")}</p>
          <Table
            head={[t("colCode"), t("colMealType"), t("colMealNote")]}
            rows={t.raw("specialMeals")}
          />
        </Section>
        <Section title={t("notesTitle")}>
          <Bullets items={paidNotes} />
        </Section>
      </>
    ),
    seat: (
      <>
        <Section title={t("seatWhyTitle")}>
          <Bullets items={[t("seatWhyTogether"), t("seatWhyAisle"), t("seatWhyWindow")]} />
        </Section>
        <Section title={t("seatMapTitle")}>
          <Bullets items={[t("seatMapNumber"), t("seatMapCabins"), t("seatMapTaken"), t("seatMapOtherClass")]} />
        </Section>
        <Section title={t("howToChooseTitle")}>
          <Steps items={[t("stepSearch"), t("seatStep"), t("stepPay")]} />
        </Section>
        <Section title={t("notesTitle")}>
          <Bullets
            items={[
              t("seatFree"),
              t("seatRequired"),
              t("seatHold", { minutes: SEAT_HOLD_DURATION_MINUTES - PAYMENT_EXPIRY_BUFFER_MINUTES }),
              t("seatNoChange"),
              t("seatCheckIn", { open: CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE, close: CHECK_IN_CLOSES_HOURS_BEFORE_DEPARTURE }),
            ]}
          />
        </Section>
      </>
    ),
    business: (
      <>
        <Section title={t("businessSeatTitle")}>
          <p>{t("businessSeat")}</p>
        </Section>
        <Section title={t("businessBaggageTitle")}>
          <p>{t("businessBaggage", { carryOn: pricing.carry_on_kg, checked: pricing.included_checked_kg.business })}</p>
        </Section>
        <Section title={t("businessMealTitle")}>
          <p>
            {pricing.meal_included.business
              ? t("businessMeal")
              : t("businessMealPaid", { price: vnd(pricing.meal_price.business) })}
          </p>
        </Section>
        <Section title={t("businessCancelTitle")}>
          <p>{t("businessCancel", { hours: full })}</p>
        </Section>
        <Section title={t("businessCompareTitle")}>
          <Table
            head={["", classLabel("economy"), classLabel("business")]}
            rows={[
              [t("colChecked"), ...CLASSES.map(checkedText)],
              [t("colMeal"), ...CLASSES.map(mealText)],
              ...cancelRows.map(([label, key]) => [label, ...CLASSES.map((c) => feeText(CANCELLATION_FEES[c][key]))]),
            ]}
          />
          <p>{t("perPassengerFee")}</p>
        </Section>
        <Section title={t("howToBuyTitle")}>
          <Steps items={[t("businessStepSearch"), t("businessStepFare"), t("seatStep"), t("stepPay")]} />
        </Section>
      </>
    ),
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <Link href="/" className="text-sm font-medium text-sea-700 hover:underline">← {t("back")}</Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">{t(`${service}Title`)}</h1>
        <p className="mt-1 text-sm text-ink/60">{t(`${service}Intro`)}</p>
      </div>
      {content[service]}
      <div className="flex w-full max-w-3xl flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/" className="font-medium text-coral-600 hover:underline">{t("searchCta")}</Link>
        <Link href="/cancellation-policy" className="font-medium text-sea-700 hover:underline">{t("policyLink")}</Link>
      </div>
    </div>
  );
}
