// i18n/request.js
//
// next-intl v4 App Router: getRequestConfig nhận `requestLocale` (Promise),
// PHẢI await rồi tự validate/fallback — next-intl không tự làm giúp nữa.

import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
