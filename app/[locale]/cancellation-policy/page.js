// app/[locale]/cancellation-policy/page.js
//
// Chính sách hủy vé cho khách — trang tĩnh, công khai. MỌI con số (mốc giờ, mức phạt, thời gian
// giữ ghế, khung check-in) đọc thẳng từ config/constants.js, cùng nguồn với
// services/cancellationService.js — đổi chính sách ở constants thì trang này tự đổi theo, không
// thể lệch với luật thật trong code (A7, ghi chú j/l/w; A8).

import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CANCELLATION_FULL_REFUND_THRESHOLD_HOURS,
  CANCELLATION_FIXED_FEE_THRESHOLD_HOURS,
  CANCELLATION_FIXED_FEE_PER_PASSENGER,
  SEAT_HOLD_DURATION_MINUTES,
  PAYMENT_EXPIRY_BUFFER_MINUTES,
  CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE,
} from "@/config/constants";
import Card from "@/components/ui/Card";

const vnd = (n) => `${n.toLocaleString("vi-VN")}đ`;

// Ví dụ minh họa mốc giữa: 2 khách, tổng 3.000.000đ, hủy trước giờ bay 10 tiếng.
const EXAMPLE_PASSENGERS = 2;
const EXAMPLE_TOTAL = 3_000_000;

function Section({ title, children }) {
  return (
    <Card className="w-full max-w-3xl p-6">
      <h2 className="font-display text-lg font-semibold text-sea-900">{title}</h2>
      <div className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink/80">{children}</div>
    </Card>
  );
}

export default async function CancellationPolicyPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CancellationPolicy");

  const full = CANCELLATION_FULL_REFUND_THRESHOLD_HOURS;
  const fixed = CANCELLATION_FIXED_FEE_THRESHOLD_HOURS;
  const fee = vnd(CANCELLATION_FIXED_FEE_PER_PASSENGER);
  const exampleFee = Math.min(CANCELLATION_FIXED_FEE_PER_PASSENGER * EXAMPLE_PASSENGERS, EXAMPLE_TOTAL);

  const tiers = [
    { when: t("tierFullWhen", { hours: full }), result: t("tierFullResult"), tone: "text-sea-700" },
    { when: t("tierFixedWhen", { from: fixed, to: full }), result: t("tierFixedResult", { fee }), tone: "text-coral-600" },
    { when: t("tierNoneWhen", { hours: fixed }), result: t("tierNoneResult"), tone: "text-danger" },
  ];

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-sea-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">{t("intro")}</p>
      </div>

      <Section title={t("paidTitle")}>
        <div className="overflow-hidden rounded-lg border border-sand-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-sand-100/60 text-xs uppercase tracking-wide text-ink/60">
              <tr>
                <th className="px-4 py-2 font-medium">{t("colWhen")}</th>
                <th className="px-4 py-2 font-medium">{t("colResult")}</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.when} className="border-t border-sand-100 align-top">
                  <td className="px-4 py-3 text-ink">{tier.when}</td>
                  <td className={`px-4 py-3 font-medium ${tier.tone}`}>{tier.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {t("example", {
            pax: EXAMPLE_PASSENGERS,
            total: vnd(EXAMPLE_TOTAL),
            fee: vnd(exampleFee),
            refund: vnd(EXAMPLE_TOTAL - exampleFee),
          })}
        </p>
        <p>{t("timeBasis")}</p>
        <p>{t("paidAmountBasis")}</p>
      </Section>

      <Section title={t("roundTripTitle")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("roundTripCase1")}</li>
          <li>{t("roundTripCase2")}</li>
          <li>{t("roundTripCase3")}</li>
        </ul>
        <p>{t("roundTripWhole")}</p>
      </Section>

      <Section title={t("otherTitle")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("unpaid", { hold: SEAT_HOLD_DURATION_MINUTES - PAYMENT_EXPIRY_BUFFER_MINUTES })}</li>
          <li>{t("checkedIn", { hours: CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE })}</li>
          <li>{t("airlineCancel")}</li>
          <li>{t("promoCode")}</li>
          <li>{t("refundProcess")}</li>
          <li>{t("noChange")}</li>
        </ul>
      </Section>
    </div>
  );
}
