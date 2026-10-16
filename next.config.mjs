import createNextIntlPlugin from "next-intl/plugin";

// Mặc định plugin tự tìm i18n/request.js (hoặc src/i18n/request.js) —
// không cần truyền path nếu đặt đúng vị trí này.
const withNextIntl = createNextIntlPlugin();

// Header bảo mật: chống nhúng trang vào iframe (clickjacking), chống đoán MIME, hạn chế rò Referer và
// quyền thiết bị, CSP giới hạn nguồn tải tài nguyên, HSTS (chỉ production).
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy: mọi script/style/font/ảnh đều do chính app phục vụ (không CDN ngoài).
// - 'unsafe-inline' cho script: Next.js App Router chèn script inline khi hydrate; bỏ được nếu chuyển
//   sang CSP dùng nonce theo từng request (proxy.js) — chưa làm, ghi nhận trong README.
// - 'unsafe-eval' + ws:/wss: CHỈ ở dev (React Refresh/HMR của `next dev`).
// - Thanh toán VNPay là chuyển hướng trang (không phải form/iframe) nên không cần mở thêm nguồn ngoài.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS: trình duyệt chỉ áp dụng khi trang chạy HTTPS; bật ở production (sau khi deploy có HTTPS).
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
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
