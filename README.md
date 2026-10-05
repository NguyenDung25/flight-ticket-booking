# Sun Phu Quoc Airways — Web đặt vé máy bay

Đồ án web đặt vé máy bay: Next.js App Router + MongoDB (Mongoose) + NextAuth (Auth.js) + next-intl (đa ngôn ngữ) + Momo (thanh toán). Chi tiết chức năng và thiết kế CSDL xem `chuc-nang-he-thong.md` và `mongodb-schema-design.md`.

## 1. Chuẩn bị

- Node.js (bản mới), MongoDB đang chạy (local hoặc Atlas).
- Tài khoản MoMo Business (M4B) để lấy khóa môi trường Test — xem mục 5.

## 2. Cài đặt

```bash
npm install
cp .env.example .env.local
```

Mở `.env.local`, điền đủ các biến (xem chú thích ngay trong file mẫu):

| Biến | Dùng để |
|---|---|
| `MONGO_URI` | Kết nối MongoDB |
| `AUTH_SECRET` | Ký session đăng nhập — sinh bằng `npx auth secret` |
| `MOMO_PARTNER_CODE` / `MOMO_ACCESS_KEY` / `MOMO_SECRET_KEY` / `MOMO_API_URL` | Thanh toán MoMo (môi trường Test) |
| `AIRLABS_API_KEY` | Seed dữ liệu sân bay/hãng bay + tự điền lịch bay khi admin tạo chuyến |
| `SMTP_*`, `EMAIL_FROM` | Gửi email vé điện tử (Gmail cần tạo App Password riêng, không dùng mật khẩu Gmail thật) |
| `APP_BASE_URL` | Chỉ cần khi test MoMo qua ngrok/tunnel — xem mục 6 |

**Không commit `.env.local`** — đã có trong `.gitignore`.

## 3. Tạo dữ liệu mẫu

```bash
npm run seed        # tài khoản admin + khách demo, hãng bay, tàu bay, sân bay
```

Lệnh in ra email/mật khẩu tài khoản demo — ghi lại để đăng nhập thử.

Muốn có sẵn vài chuyến bay đúng các mốc giờ để test hủy vé (>24h / 3–24h / <3h) và check-in:

```bash
npm run seed:test
```

Script này tạo chuyến bay **khởi hành tính từ lúc chạy lệnh** (không phải ngày cố định) — chạy lại bất cứ lúc nào cần bộ dữ liệu mới.

## 4. Chạy dự án

Cần **2 cửa sổ terminal** chạy song song:

```bash
npm run dev    # cửa sổ 1 — server chính, http://localhost:3000
npm run cron   # cửa sổ 2 — nhả ghế giữ quá hạn + hủy booking quá hạn thanh toán
```

Thiếu `npm run cron` thì các booking quá hạn thanh toán sẽ không tự hủy, ghế sẽ bị giữ mãi.

## 5. Lấy khóa MoMo (môi trường Test)

Bộ khóa test dùng chung công khai kiểu cũ (`MOMOBKUN...`) **không còn dùng được** — MoMo hiện bắt buộc tự đăng ký tài khoản M4B:

1. Đăng ký tại [developers.momo.vn](https://developers.momo.vn) (chưa cần xác thực giấy tờ doanh nghiệp, đăng ký xong có ngay khóa Test).
2. Chọn giải pháp "Thanh toán qua ứng dụng MoMo".
3. Vào mục "Thông tin tích hợp" lấy `Partner Code` / `Access Key` / `Secret Key`, dán vào `.env.local`.
4. `MOMO_API_URL` giữ nguyên `https://test-payment.momo.vn`.

## 6. Test thanh toán MoMo qua ngrok (bắt buộc nếu chạy local)

MoMo cần gọi ngược (IPN) về server của bạn sau khi khách thanh toán xong — `localhost` thì MoMo không gọi tới được.

```bash
ngrok http 3000
```

Copy địa chỉ `https://xxxx.ngrok-free.app`, thêm vào `.env.local`:

```
APP_BASE_URL=https://xxxx.ngrok-free.app
```

Restart `npm run dev`, rồi **mở web bằng chính địa chỉ ngrok** (không mở `localhost`). Theo dõi MoMo có gọi về không tại `http://127.0.0.1:4040`.

Địa chỉ ngrok bản free đổi mỗi lần chạy lại — nhớ cập nhật `APP_BASE_URL` và restart mỗi lần.

## 6b. Thanh toán bằng thẻ ATM nội địa qua cổng MoMo (không cần app MoMo)

Hệ thống thanh toán bằng **thẻ ATM nội địa qua cổng MoMo** (`requestType: payWithATM`) — vẫn là API thanh toán MoMo thật, cùng endpoint `/v2/gateway/api/create`, cùng chữ ký HMAC-SHA256 và cùng webhook (IPN). Không dùng luồng ví MoMo/quét QR nên **không cần cài app MoMo Test**.

Luồng: khách bấm "Thanh toán" → được chuyển sang trang `payUrl` của MoMo/Napas → nhập thẻ → MoMo gọi webhook `POST /api/payments/[bookingId]` → booking `confirmed` (hoặc `cancelled` nếu thất bại). Phương thức được lưu ở `Booking.payment.method = "momo_atm"`.

Thẻ test của MoMo (môi trường Test), tên chủ thẻ `NGUYEN VAN A`, hạn `03/07`, nhập OTP theo yêu cầu trên trang:

| Số thẻ | Kết quả mô phỏng |
|---|---|
| `9704 0000 0000 0018` | Thành công |
| `9704 0000 0000 0026` | Thẻ bị khóa |
| `9704 0000 0000 0034` | Không đủ tiền |
| `9704 0000 0000 0042` | Vượt hạn mức |

Các thẻ lỗi dùng để test nhánh thanh toán thất bại (booking chuyển `cancelled`, nhả ghế ngay). Webhook vẫn cần ngrok như mục 6. Nếu MoMo trả lỗi khi tạo yêu cầu `payWithATM`, xem `message` + `resultCode` trong log server — có thể bộ khóa đang dùng chưa được bật loại thanh toán này.

## 7. Cấu trúc chính

```
app/[locale]/        # Giao diện khách — đa ngôn ngữ (vi/en)
app/admin/            # Giao diện quản trị — KHÔNG qua next-intl
app/api/              # API routes (REST, không dùng Server Action cho phần nghiệp vụ)
models/                # 7 Mongoose schema — xem mongodb-schema-design.md
services/              # Logic nghiệp vụ (tách khỏi route) — seatService, cancellationService, statsService...
lib/                   # Hạ tầng dùng chung: mongodb, timezone (giờ VN), apiError, momoClient, emailClient
cron/                  # Job chạy nền — xem mục 4
scripts/                # Script chạy tay: seed dữ liệu, seed AirLabs
i18n/, messages/        # Cấu hình + nội dung dịch next-intl
```

## 8. Script có sẵn

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production |
| `npm run lint` | Kiểm tra ESLint |
| `npm run cron` | Chạy job nhả ghế/hủy booking quá hạn (chạy song song `dev`) |
| `npm run seed` | Tạo tài khoản + dữ liệu nền demo |
| `npm run seed:test` | Tạo chuyến bay test theo các mốc giờ hủy vé/check-in |
| `npm run test:momo` | Gọi thử API tạo thanh toán MoMo thật (thẻ ATM) để kiểm tra khóa — không cần chạy web/MongoDB |

## 9. Tài khoản demo

Do `npm run seed` tạo ra, in trực tiếp ra terminal lúc chạy — **chỉ dùng để demo cục bộ**, không dùng lại mật khẩu này ở nơi khác.

## 10. Lưu ý đã biết

- `npm audit` còn 3 lỗ hổng mức "high" ở `nodemailer`/`next-auth` (lỗi của thư viện, chưa có bản vá non-breaking). Rủi ro thấp vì email chỉ gửi tới địa chỉ do hệ thống kiểm soát — **không chạy `npm audit fix --force`** vì sẽ hạ `next-auth` xuống bản rất cũ, hỏng đăng nhập.
- Không có PUT/DELETE cho Aircraft/Airline (chỉ có cho Flight và Promotion) — đơn giản hóa có chủ đích, không phải thiếu sót.

## 7. Kiểm thử

```bash
npm test      # 21 test tự động cho quy tắc nghiệp vụ thuần (phí hủy, giấy tờ theo tuổi, transit, check-in, chữ ký MoMo...) — không cần MongoDB
```

Bảng test case thủ công cho Chương 4 (64 trường hợp, có cột điền kết quả) nằm ở `docs/test-cases.md`.

## 8. Một số hành vi cần biết khi demo

- **IPN MoMo không về được** (VD ngrok tắt): khi khách quay lại trang `/payment?bookingId=...`, hệ thống tự hỏi lại MoMo (`POST /v2/gateway/api/query`) và xác nhận booking nếu giao dịch đã thành công. Chỉ xử lý chiều thành công; thất bại/đang xử lý để IPN hoặc cron dọn.
- **Thanh toán đến muộn**: nếu MoMo báo thành công nhưng booking đã bị hủy (quá hạn/khách hủy), booking chuyển `payment_error_manual_refund` để admin hoàn tay.
- **Hoàn tiền tay**: ở trang Admin → Booking, booking `payment_error_manual_refund` có nút "Hoàn tiền tay" (nhập số tiền đã chuyển trả khách). Hệ thống chỉ ghi nhận số tiền, chưa gọi API hoàn tiền của MoMo.
- **Hãng bay / máy bay**: sửa và xóa ngay trên bảng. Xóa bị chặn nếu còn chuyến bay đang dùng. Sửa sơ đồ ghế máy bay chỉ áp dụng cho chuyến tạo sau.
