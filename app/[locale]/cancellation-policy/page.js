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
  CANCELLATION_FEES,
  SEAT_HOLD_DURATION_MINUTES,
  PAYMENT_EXPIRY_BUFFER_MINUTES,
  CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE,
} from "@/config/constants";
import Card from "@/components/ui/Card";

const vnd = (n) => `${n.toLocaleString("vi-VN")}đ`;

// Ví dụ minh họa mốc giữa: 2 khách, tổng 3.000.000đ, hủy trước giờ bay 10 tiếng.
// Ví dụ trên trang: phần tiền vé của 1 khách phổ thông và 1 khách thương gia trong cùng booking.
const EXAMPLE_ECONOMY = 1_000_000;
const EXAMPLE_BUSINESS = 3_000_000;

function Section({ title, children }) {
  return (
    <Card className="w-full max-w-3xl p-6">
      <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
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
  // Ô kết quả theo hạng ghế: 0đ -> hoàn 100%; null -> mất toàn bộ; còn lại -> phí mỗi khách.
  const cell = (amount) =>
    amount === 0
      ? { text: t("resultFree"), tone: "text-success" }
      : amount === null
        ? { text: t("resultLoseAll"), tone: "text-danger" }
        : { text: t("resultFee", { fee: vnd(amount) }), tone: "text-ink" };
  const rows = [
    { key: "early", when: t("tierFullWhen", { hours: full }) },
    { key: "mid", when: t("tierFixedWhen", { from: fixed, to: full }) },
    { key: "late", when: t("tierNoneWhen", { hours: fixed }) },
  ].map((r) => ({ ...r, economy: cell(CANCELLATION_FEES.economy[r.key]), business: cell(CANCELLATION_FEES.business[r.key]) }));

  // Ví dụ: 1 khách phổ thông + 1 khách thương gia, hủy trước giờ bay 10 tiếng (mốc "mid").
  const exEco = EXAMPLE_ECONOMY;
  const exBiz = EXAMPLE_BUSINESS;
  const exFee = Math.min(CANCELLATION_FEES.economy.mid, exEco) + Math.min(CANCELLATION_FEES.business.mid, exBiz);

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">{t("intro")}</p>
      </div>

      <Section title={t("paidTitle")}>
        <div className="overflow-x-auto rounded-lg border border-sand-100">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-sand-50 text-xs text-ink/60">
              <tr>
                <th className="px-4 py-2 font-medium">{t("colWhen")}</th>
                <th className="px-4 py-2 font-medium">{t("colEconomy")}</th>
                <th className="px-4 py-2 font-medium">{t("colBusiness")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-sand-100 align-top">
                  <td className="px-4 py-3 text-ink">{r.when}</td>
                  <td className={`px-4 py-3 font-medium ${r.economy.tone}`}>{r.economy.text}</td>
                  <td className={`px-4 py-3 font-medium ${r.business.tone}`}>{r.business.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t("perPassenger")}</p>
        <p>{t("whyBusiness")}</p>
        <p>
          {t("example", {
            eco: vnd(exEco),
            biz: vnd(exBiz),
            fee: vnd(exFee),
            refund: vnd(exEco + exBiz - exFee),
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
