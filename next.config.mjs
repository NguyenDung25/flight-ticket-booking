import createNextIntlPlugin from "next-intl/plugin";

// Mặc định plugin tự tìm i18n/request.js (hoặc src/i18n/request.js) —
// không cần truyền path nếu đặt đúng vị trí này.
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
