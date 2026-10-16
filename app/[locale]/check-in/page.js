// app/[locale]/check-in/page.js
//
// C10 — check-in online, làm giống website hãng bay: KHÔNG cần đăng nhập. Khách nhập mã đặt chỗ (mã
// vé điện tử) + họ tên 1 hành khách -> thấy mọi ghế của booking, check-in từng ghế và nhận thẻ lên
// máy bay (có mã QR, in/lưu PDF được). Tra cứu + check-in đều qua API (POST, để họ tên không nằm
// trên URL): /api/check-in/lookup và /api/flights/[id]/check-in.
//
// ?code=XXXXXX (lối tắt từ "Vé của tôi") chỉ điền sẵn mã, khách vẫn phải nhập họ tên.

import { getTranslations, setRequestLocale } from "next-intl/server";
import { normalizeBookingCode } from "@/lib/bookingCode";
import CheckInLookup from "./CheckInLookup";

export default async function CheckInPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CheckIn");

  const sp = await searchParams;
  const initialCode = normalizeBookingCode(typeof sp.code === "string" ? sp.code : "") ?? "";

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">{t("windowNote")}</p>
      </div>
      <CheckInLookup initialCode={initialCode} />
    </div>
  );
}
