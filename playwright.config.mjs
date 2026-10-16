// playwright.config.mjs — test giao diện tự động (E2E) bằng Playwright.
//
// Chạy: npm run test:e2e   (build production rồi chạy test; cần MongoDB đang chạy + Google Chrome)
// - App chạy bản production (`next start`) ở cổng 3100 với database RIÊNG "ftb-e2e" — seed khi bắt
//   đầu (e2e/global-setup.mjs), xóa khi xong (e2e/global-teardown.mjs). Không đụng DB của app.
// - Tắt SMTP (không gửi email thật); trang thanh toán VNPay bị chặn trong test (chỉ kiểm tra URL).
// - Dùng Chrome cài sẵn trên máy (channel "chrome") — không cần `npx playwright install`.

import path from "node:path";
import { defineConfig } from "@playwright/test";
import { E2E_MONGO_URI, E2E_PORT } from "./e2e/env.mjs";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.mjs",
  globalTeardown: "./e2e/global-teardown.mjs",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    channel: "chrome",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next start -p ${E2E_PORT}`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MONGO_URI: E2E_MONGO_URI,
      AUTH_TRUST_HOST: "true",
      NEXT_PUBLIC_BASE_URL: `http://localhost:${E2E_PORT}`,
      // Rỗng = chưa cấu hình SMTP -> link xác thực / đặt lại mật khẩu chỉ in ra log, không gửi thật.
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      // Windows: thư mục cache SWC trong dự án (xem README "Lỗi nạp SWC trên Windows").
      SWC_NATIVE_BINDING_CACHE: process.env.SWC_NATIVE_BINDING_CACHE || path.resolve(".swc-cache"),
    },
  },
});
