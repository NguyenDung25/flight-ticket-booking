import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  // "as-needed": URL /vi/...
  localePrefix: "as-needed",
});
