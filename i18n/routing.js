// i18n/routing.js
//
// C11 — chỉ áp dụng đa ngôn ngữ cho khu vực khách hàng (app/[locale]/...).
// Khu vực Admin (app/admin/...) KHÔNG đi qua routing này, xem proxy.js.

import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  // "as-needed": URL /vi/... không bị gắn prefix /vi (vì vi là default),
  // chỉ /en/... mới có prefix. Khớp với thói quen người dùng Việt Nam vào
  // domain gốc là thấy ngay tiếng Việt.
  localePrefix: "as-needed",
});
