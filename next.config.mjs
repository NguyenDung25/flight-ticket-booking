import createNextIntlPlugin from "next-intl/plugin";

// Mặc định plugin tự tìm i18n/request.js (hoặc src/i18n/request.js) —
// không cần truyền path nếu đặt đúng vị trí này.
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cho phép mở trang dev qua ngrok (test Momo IPN) — Next chặn tài nguyên dev
  // (/_next/*, HMR) và Server Action (login/register dùng "use server") từ
  // origin lạ, thiếu dòng này trang qua ngrok có thể không hydrate/không đăng
  // nhập được. Chỉ ảnh hưởng `next dev`, không ảnh hưởng build.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev", "*.ngrok.io"],
};

export default withNextIntl(nextConfig);
