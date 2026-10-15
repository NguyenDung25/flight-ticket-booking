import createNextIntlPlugin from "next-intl/plugin";

// Mặc định plugin tự tìm i18n/request.js (hoặc src/i18n/request.js) —
// không cần truyền path nếu đặt đúng vị trí này.
const withNextIntl = createNextIntlPlugin();

// Header bảo mật cơ bản: chống nhúng trang vào iframe (clickjacking), chống đoán MIME, hạn chế rò
// Referer và quyền thiết bị. (Chưa đặt CSP chặt vì Next.js dev/HMR dùng script inline — cân nhắc khi deploy.)
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Cho phép mở trang dev qua ngrok (test IPN VNPay) — Next chặn tài nguyên dev
  // (/_next/*, HMR) và Server Action (login/register dùng "use server") từ
  // origin lạ, thiếu dòng này trang qua ngrok có thể không hydrate/không đăng
  // nhập được. Chỉ ảnh hưởng `next dev`, không ảnh hưởng build.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev", "*.ngrok.io"],
};

export default withNextIntl(nextConfig);
