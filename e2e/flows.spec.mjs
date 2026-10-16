// e2e/flows.spec.mjs — các luồng chính trên trình duyệt thật (Chrome) với app bản production + database
// E2E riêng (xem playwright.config.mjs). Tài khoản demo lấy từ scripts/seedSample.js (mật khẩu mặc định).
import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { E2E_MONGO_URI } from "./env.mjs";

const CUSTOMER = { email: "customer@example.com", password: "Customer@123" };
const VNPAY_HOST = "https://sandbox.vnpayment.vn/**";
// Next.js luôn có 1 phần tử role="alert" rỗng (thông báo chuyển trang) — chỉ lấy alert có nội dung.
const errorAlert = (page) => page.getByRole("alert").filter({ hasText: /\S/ });

/** Ngày mai theo giờ Việt Nam, dạng YYYY-MM-DD (seed tạo chuyến HAN→SGN VN200 ngày mai). */
function tomorrowVN() {
  const d = new Date(Date.now() + 7 * 3600 * 1000 + 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

let vn200Id;
test.beforeAll(async () => {
  const conn = await mongoose.createConnection(E2E_MONGO_URI).asPromise();
  vn200Id = String((await conn.collection("flights").findOne({ flight_number: "VN200" }))._id);
  await conn.close();
});

async function login(page, { email, password }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("trang chủ hiển thị tiêu đề và đổi được sang tiếng Anh", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Vé máy bay giá tốt, bay khắp Việt Nam" })).toBeVisible();
  await page.getByRole("combobox", { name: "Ngôn ngữ" }).selectOption("en");
  await expect(page).toHaveURL(/\/en(\/|$)/);
  await expect(page.getByRole("heading", { name: "Great-value flights across Vietnam" })).toBeVisible();
});

test("đăng nhập sai mật khẩu báo lỗi; đúng thì vào được trang tài khoản (email đã xác thực)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(CUSTOMER.email);
  await page.getByLabel("Mật khẩu").fill("sai-mat-khau");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(errorAlert(page)).toContainText("Email hoặc mật khẩu không đúng");

  await login(page, CUSTOMER);
  await page.goto("/account");
  await expect(page.getByText(CUSTOMER.email)).toBeVisible();
  await expect(page.getByText("Email đã được xác thực")).toBeVisible();
});

test("đặt vé 1 chiều có hành lý + suất ăn -> sang VNPay đúng số tiền; hủy được ở Vé của tôi", async ({ page }) => {
  await login(page, CUSTOMER);

  // Tìm chuyến -> chi tiết -> tóm tắt -> nhập hành khách
  const q = new URLSearchParams({ origin: "HAN", destination: "SGN", departureDate: tomorrowVN(), tripType: "one_way", passengerCount: "1" });
  await page.goto(`/search?${q}`);
  await page.getByRole("link", { name: "Xem chi tiết" }).first().click();
  await page.getByRole("link", { name: "Chọn chuyến này" }).first().click();
  await page.getByRole("link", { name: "Tiếp tục nhập thông tin hành khách" }).click();
  await expect(page).toHaveURL(/\/booking\/passengers/);

  await page.getByLabel("Họ và tên").fill("Nguyen Van E2E");
  await page.getByLabel("Số giấy tờ tùy thân").fill("001090012345");
  await page.getByLabel("Ngày sinh").fill("1990-01-01");
  await page.locator('button[title$="· economy"]:not([disabled])').first().click();
  await page.getByLabel("Số điện thoại").fill("0901234567");

  // Dịch vụ bổ sung: +20kg (250.000đ) + suất ăn (80.000đ) trên giá vé phổ thông 1.500.000đ
  await page.getByLabel("Mua thêm hành lý ký gửi").selectOption("20");
  await page.getByLabel(/Suất ăn trên máy bay/).check();
  await expect(page.getByText("1.830.000đ")).toBeVisible();
  await expect(page.getByText("Giá vé 1.500.000đ + dịch vụ 330.000đ")).toBeVisible();

  // Không mở trang VNPay thật — chỉ kiểm tra URL thanh toán mang đúng số tiền (x100 theo chuẩn VNPay).
  let payUrl = null;
  await page.route(VNPAY_HOST, (route) => {
    payUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>VNPay (giả lập trong test)</p>" });
  });
  await page.getByRole("button", { name: "Tiếp tục thanh toán" }).click();
  await page.waitForURL(/sandbox\.vnpayment\.vn/);
  expect(new URL(payUrl).searchParams.get("vnp_Amount")).toBe(String(1_830_000 * 100));

  // Booking chờ thanh toán xuất hiện ở Vé của tôi và hủy được (ghế được trả lại).
  await page.goto("/my-bookings");
  await expect(page.getByText("Chờ thanh toán").first()).toBeVisible();
  await page.getByRole("button", { name: "Hủy vé" }).first().click();
  await expect(page.getByText("Xác nhận hủy vé này?")).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã hủy").first()).toBeVisible();
});

test("đăng ký tài khoản mới: chưa xác thực email thì chưa được vào bước đặt vé", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Họ và tên").fill("E2E New User");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.test`);
  await page.getByLabel("Mật khẩu").fill("E2eTest#2026");
  await page.getByRole("button", { name: "Đăng ký" }).click();

  await expect(page).toHaveURL(/\/account\?registered=1/);
  await expect(page.getByText("Email chưa được xác thực")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi lại email xác thực" })).toBeVisible();

  await page.goto(`/booking/passengers?tripType=one_way&passengerCount=1&outboundFlightId=${vn200Id}`);
  await expect(page.getByText("Bạn cần xác thực email trước khi đặt vé")).toBeVisible();
  await expect(page.getByLabel("Họ và tên")).toHaveCount(0);
});

test("check-in online: mã đặt chỗ không tồn tại thì báo lỗi, không lộ thông tin", async ({ page }) => {
  await page.goto("/check-in");
  await page.getByLabel("Mã đặt chỗ (mã vé điện tử)").fill("ZZZZZZ");
  await page.getByLabel("Họ của hành khách").fill("Nguyen");
  await page.getByRole("button", { name: "Tìm vé" }).click();
  await expect(errorAlert(page)).toBeVisible();
});

test("trang cần đăng nhập chuyển về trang đăng nhập", async ({ page }) => {
  await page.goto("/my-bookings");
  await expect(page).toHaveURL(/\/login/);
});
