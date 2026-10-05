"use client";

// components/layout/LanguageSwitcher.jsx
//
// C11 — đổi ngôn ngữ giao diện (vi/en). Làm 2 việc cùng lúc:
// 1. Đổi locale trên URL (router.replace) — thay đổi ngay lập tức, không cần
//    đợi API trả về.
// 2. Gọi PATCH /api/users/me để lưu preferred_language vào DB (nếu đã đăng
//    nhập) — dùng cho lần đặt vé tiếp theo: Booking.locale lấy từ
//    User.preferred_language tại thời điểm tạo booking (C6), email vé và
//    boarding pass dùng Booking.locale (C7, C10).
//
// Gọi API sau khi đã router.replace (fire-and-forget, không await) — tránh
// khách thấy trễ khi đổi ngôn ngữ chỉ vì API chậm. Lỗi API (VD chưa đăng
// nhập, mạng lỗi) bị bỏ qua hoàn toàn: đổi ngôn ngữ giao diện vẫn hoạt động
// bình thường, chỉ là preferred_language trong DB không được cập nhật — chấp
// nhận được, vì khách chưa đăng nhập không đặt được vé (C8), và khách đã đăng
// nhập gặp lỗi mạng thoáng qua thì locale session vẫn đúng theo URL.

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_LABELS = {
  vi: "Tiếng Việt",
  en: "English",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("Nav");

  function handleChange(event) {
    const newLocale = event.target.value;
    const query = Object.fromEntries(searchParams.entries());

    // 1. Đổi URL ngay lập tức
    router.replace({ pathname, query }, { locale: newLocale });

    // 2. Lưu vào DB (fire-and-forget)
    fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_language: newLocale }),
    }).catch(() => {
      // bỏ qua lỗi — xem comment đầu file
    });
  }

  return (
    <select
      aria-label={t("language")}
      value={locale}
      onChange={handleChange}
      className="rounded-lg border border-sand-100 bg-sand-50 px-2 py-1.5 text-sm text-ink"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l] ?? l}
        </option>
      ))}
    </select>
  );
}
