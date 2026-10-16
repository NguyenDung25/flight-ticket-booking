# DelayX — Web đặt vé máy bay

Đồ án web đặt vé máy bay: Next.js App Router + MongoDB (Mongoose) + NextAuth (Auth.js) + next-intl (đa ngôn ngữ) + VNPay (thanh toán). Chi tiết chức năng và thiết kế CSDL xem [`docs/chuc-nang-he-thong.md`](docs/chuc-nang-he-thong.md) và [`docs/mongodb-schema-design.md`](docs/mongodb-schema-design.md).

## 1. Chuẩn bị

- Node.js (bản mới), MongoDB đang chạy (local hoặc Atlas).
- Tài khoản merchant sandbox của VNPay để lấy khóa test — xem mục 5.

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
| `VNPAY_TMN_CODE` / `VNPAY_HASH_SECRET` / `VNPAY_PAY_URL` / `VNPAY_API_URL` | Thanh toán VNPay (môi trường sandbox) |
| `AIRLABS_API_KEY` | Seed dữ liệu sân bay/hãng bay + tự điền lịch bay khi admin tạo chuyến |
| `SMTP_*`, `EMAIL_FROM` | Gửi email vé điện tử (Gmail cần tạo App Password riêng, không dùng mật khẩu Gmail thật) |
| `NEXT_PUBLIC_BASE_URL` | Chỉ cần khi test IPN VNPay qua ngrok/tunnel — xem mục 6b |

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

## 5. Lấy khóa VNPay (môi trường sandbox)

1. Đăng ký tài khoản merchant test tại [sandbox.vnpayment.vn/devreg](https://sandbox.vnpayment.vn/devreg/). VNPay gửi **Terminal ID (`vnp_TmnCode`)** và **Secret Key (`vnp_HashSecret`)** qua email, kèm tài khoản đăng nhập trang quản trị merchant sandbox.
2. Dán vào `.env.local`: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`. `VNPAY_PAY_URL` và `VNPAY_API_URL` giữ nguyên địa chỉ sandbox trong `.env.example`.
3. Kiểm tra khóa: `npm run test:vnpay` — in ra 1 URL thanh toán thử, và gọi API truy vấn để xác nhận khóa đúng (không cần chạy web/MongoDB).

## 6. Luồng thanh toán VNPay

Khách bấm "Thanh toán" → `POST /api/payments/[bookingId]` dựng URL thanh toán có chữ ký (HMAC-SHA512) → khách được chuyển sang trang VNPay, chọn ngân hàng và nhập thẻ → VNPay đưa khách về **Return URL** `/{locale}/payment?vnp_...`. Phương thức được lưu ở `Booking.payment.method = "vnpay"`.

Kết quả thanh toán được chốt bằng **2 đường độc lập** (đều atomic, chạy song song không bị ghi đè, không phát vé 2 lần):

- **Trang kết quả (Return URL)**: server **không tin** tham số `vnp_*` trên URL mà tự hỏi lại VNPay bằng API truy vấn `querydr` → thành công thì `confirmed`, thất bại thì `cancelled` + nhả ghế. Đường này **chạy được trên `localhost`, không cần ngrok**.
- **IPN** (`GET /api/payments/vnpay-ipn`): VNPay gọi ngầm server → server. Xác minh chữ ký + `vnp_TmnCode` + số tiền rồi cập nhật booking; trả `{ RspCode, Message }` theo quy ước VNPay (`00` xong, `02` đã xác nhận trước đó, `97` sai chữ ký, `01` không thấy đơn, `04` sai số tiền, `99` lỗi khác).

Thẻ test của VNPay sandbox (chọn ngân hàng **NCB** trên trang thanh toán):

| Trường | Giá trị |
|---|---|
| Số thẻ | `9704198526191432198` |
| Tên chủ thẻ | `NGUYEN VAN A` |
| Ngày phát hành | `07/15` |
| Mật khẩu OTP | `123456` |

Muốn test nhánh thất bại: bấm "Hủy thanh toán" trên trang VNPay (booking chuyển `cancelled`, nhả ghế ngay khi quay về trang kết quả).

## 6b. Test IPN qua ngrok (không bắt buộc)

Chỉ cần nếu muốn kiểm tra riêng đường IPN (VD khách đóng trình duyệt trước khi về trang kết quả). VNPay cần gọi được server của bạn — `localhost` thì không gọi tới được:

```bash
ngrok http 3000
```

(Hoặc chạy `powershell -ExecutionPolicy Bypass -File scripts\start-ngrok.ps1` để tự ghi `NEXT_PUBLIC_BASE_URL` vào `.env.local`.)

1. Thêm vào `.env.local`: `NEXT_PUBLIC_BASE_URL=https://xxxx.ngrok-free.app`, restart `npm run dev`, **mở web bằng chính địa chỉ ngrok**.
2. Khai báo **IPN URL** `https://xxxx.ngrok-free.app/api/payments/vnpay-ipn` ở trang quản trị merchant sandbox của VNPay (VNPay không nhận IPN URL theo từng giao dịch như MoMo; nếu trang quản trị không cho sửa, liên hệ hỗ trợ VNPay).
3. Theo dõi VNPay gọi về tại `http://127.0.0.1:4040`.

Địa chỉ ngrok bản free đổi mỗi lần chạy lại — nhớ cập nhật `NEXT_PUBLIC_BASE_URL`, IPN URL và restart mỗi lần.

## 7. Cấu trúc chính

```
app/[locale]/        # Giao diện khách — đa ngôn ngữ (vi/en)
app/admin/            # Giao diện quản trị — KHÔNG qua next-intl
app/api/              # API routes (REST, không dùng Server Action cho phần nghiệp vụ)
models/                # 8 Mongoose schema — xem docs/mongodb-schema-design.md
services/              # Logic nghiệp vụ (tách khỏi route) — seatService, cancellationService, statsService...
lib/                   # Hạ tầng dùng chung: mongodb, timezone (giờ VN), apiError, vnpayClient, emailClient
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
| `npm run test:vnpay` | Dựng URL thanh toán thử + gọi API truy vấn VNPay để kiểm tra khóa — không cần chạy web/MongoDB |

## 9. Tài khoản demo

Do `npm run seed` tạo ra, in trực tiếp ra terminal lúc chạy — **chỉ dùng để demo cục bộ**, không dùng lại mật khẩu này ở nơi khác.

## 10. Kiểm thử

```bash
npm test       # 169 test tự động (phí hủy, giấy tờ theo tuổi, transit, check-in, chữ ký VNPay, dịch thông báo lỗi...) — không cần MongoDB
npm run test:integration  # 12 test với MongoDB THẬT (giữ ghế/race, hủy vé, IPN + querydr, check-in, khuyến mãi, đặt lại mật khẩu, xác thực email, bảng giá dịch vụ bổ sung, nhật ký admin)
npm run test:e2e          # build production + 8 kịch bản giao diện trên Chrome (Playwright)
npm run lint   # ESLint theo bộ luật của Next.js
npm run build  # build production — nên chạy 1 lần trước khi demo/bảo vệ
```

- `npm test` dùng bản giả của DB (stub) cho luồng thanh toán/race. `npm run test:integration` chạy các luồng đó trên MongoDB thật: mặc định `mongodb://127.0.0.1:27017` (đổi bằng biến `INTEGRATION_MONGO_URL`), mỗi lần tạo 1 database riêng `ftb-integration-<thời gian>` rồi **xóa đi khi chạy xong** — không đụng DB của app, không gửi email thật.
- `npm run test:e2e` chạy app bản production ở cổng 3100 với database riêng `ftb-e2e` (seed lúc bắt đầu, xóa khi xong), tắt SMTP và chặn trang VNPay (chỉ kiểm tra URL thanh toán có đúng số tiền). Dùng Google Chrome cài sẵn trên máy, không cần `npx playwright install`.
- Bảng test case thủ công cho Chương 4 (114 trường hợp, có cột điền kết quả) nằm ở `docs/test-cases.md`.

## 11. Một số hành vi cần biết khi demo

- **IPN VNPay không về được** (chạy local không ngrok): khi khách về trang `/payment` (hoặc mở lại `/payment?bookingId=...`), hệ thống tự hỏi lại VNPay (`querydr`) và chốt booking theo kết quả thật. Chưa thanh toán / đang xử lý thì giữ nguyên để IPN hoặc cron dọn.
- **Thanh toán đến muộn**: nếu VNPay báo thành công nhưng booking đã bị hủy (quá hạn/khách hủy), booking chuyển `payment_error_manual_refund` để admin hoàn tay.
- **Hoàn tiền tay**: ở trang Admin → Booking, booking `payment_error_manual_refund` có nút "Hoàn tiền tay" (nhập số tiền đã chuyển trả khách). Hệ thống chỉ ghi nhận số tiền, chưa gọi API hoàn tiền của VNPay.
- **Check-in online** (`/check-in`): không cần đăng nhập — nhập mã đặt chỗ + họ của 1 hành khách, chọn chặng và hành khách, đồng ý quy định ICI, nhận thẻ lên máy bay có mã QR. Nhập sai 5 lần thì bị khóa tra cứu 15 phút (lưu trong bộ nhớ — restart server là mở khóa).
- **Email vé**: cần `SMTP_USER`/`SMTP_PASS` (Gmail App Password). Chưa cấu hình thì trang kết quả thanh toán báo "chưa gửi được qua email" thay vì báo đã gửi. Vé gửi về **email liên hệ** khách nhập lúc đặt vé.
- **Xác thực email**: tài khoản **đăng ký mới** phải bấm link trong email mới được đặt vé (tài khoản seed/demo coi như đã xác thực). Chưa cấu hình SMTP thì link in ra log server (`[email] Chưa cấu hình SMTP — link xác thực email ...`); gửi lại ở trang Tài khoản.
- **Hành lý & suất ăn**: chọn theo từng hành khách, từng chặng ở bước nhập hành khách (mặc định: xách tay 7kg; ký gửi mua thêm 15–30kg; thương gia đã gồm 30kg + suất ăn). Giá dịch vụ do server tính và cộng vào tiền chặng — hủy vé thì hoàn theo cùng mốc phí. Admin sửa bảng giá ở **Admin → Dịch vụ bổ sung** (`/admin/ancillaries`); giá mới chỉ áp dụng cho booking tạo sau đó.
- **Tài khoản** (`/account`): sửa họ tên, đổi mật khẩu (đăng xuất mọi thiết bị). **Quên mật khẩu** (`/forgot-password`): chưa cấu hình SMTP thì link đặt lại mật khẩu được in ra log server (`[email] Chưa cấu hình SMTP — link đặt lại mật khẩu ...`).
- **Nhật ký thao tác admin** (`/admin/logs`): mọi thao tác thay đổi dữ liệu của admin (hủy vé thay khách, hoàn tiền tay, khóa user, sửa/hủy chuyến...).
- **Ngôn ngữ**: thông báo lỗi từ server được dịch sang tiếng Anh ở giao diện EN (`lib/apiMessages.js` — thêm bản dịch khi thêm thông báo lỗi mới).
- **Hãng bay / máy bay**: sửa và xóa ngay trên bảng. Xóa bị chặn nếu còn chuyến bay đang dùng. Sửa sơ đồ ghế máy bay chỉ áp dụng cho chuyến tạo sau.

## 12. Lưu ý đã biết

- **`TRUST_PROXY`**: chỉ đặt `true` khi app chạy sau proxy tin cậy (ngrok, Nginx). Mặc định hệ thống **không tin** header `X-Forwarded-For` (người gọi tự gửi được) nên mọi request dùng chung 1 khóa chống dò mã check-in.
- **Các bộ đếm chống dò / chống spam** (đăng nhập sai, tra cứu check-in, gửi lại email vé, đăng ký 5 lần / 15 phút / IP) lưu trong bộ nhớ tiến trình: đủ cho đồ án chạy 1 instance; triển khai nhiều instance cần chuyển sang Redis hoặc collection MongoDB có TTL.
- **IPN VNPay** mới được kiểm thử bằng unit test; luồng thanh toán thật đã kiểm chứng qua trang kết quả (`querydr`). Muốn thử IPN thật xem mục 6b.
- **Lỗi nạp SWC trên Windows** (`Failed to load native binding`, `ERR_SWC_NATIVE_CACHE`): đặt biến `SWC_NATIVE_BINDING_CACHE` trỏ tới thư mục `.swc-cache` trong dự án trước khi chạy `npm run dev`/`npm run build` (PowerShell: `$env:SWC_NATIVE_BINDING_CACHE="$PWD\.swc-cache"`). Không đặt thư mục này trong `.next` — `next build` sẽ xóa nó.
- **Header bảo mật** (`next.config.mjs`): CSP chỉ cho tải tài nguyên từ chính site (thêm `'unsafe-eval'`/websocket khi dev cho HMR), chặn nhúng iframe, HSTS chỉ bật ở production. Thêm script/ảnh/API từ domain khác thì phải mở trong CSP.
- **`npm audit`**: các gói chạy production không có lỗ hổng (`npm audit --omit=dev` → 0). Lỗ hổng mức "high" còn lại nằm ở công cụ lint (`eslint-config-next` → `braces`/`micromatch`, chỉ là DoS khi xử lý glob lúc chạy lint), không đi vào ứng dụng. **Không chạy `npm audit fix --force`**: có thể hạ `next-auth`/`eslint-config-next` xuống bản không tương thích.
