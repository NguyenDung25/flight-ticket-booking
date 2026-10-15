# Thiết kế chi tiết Schema MongoDB — Hệ thống đặt vé máy bay

> Dựa trên [`chuc-nang-he-thong.md`](chuc-nang-he-thong.md). Database MongoDB **standalone** (không replica set) → mọi ràng buộc "toàn vẹn" đều xử lý bằng **update atomic + validate ở tầng service**, không dùng multi-document transaction.

## 0. Tổng quan 9 collection & quan hệ

| Collection | Vai trò | Tham chiếu tới |
|---|---|---|
| `User` | Tài khoản khách hàng + admin | — |
| `Airport` | Sân bay (seed từ AirLabs) | — |
| `Airline` | Hãng bay | — |
| `Aircraft` | Loại máy bay + sơ đồ ghế mẫu | `Airline` (tùy chọn, nếu 1 hãng chỉ dùng máy bay của mình) |
| `Flight` | Chuyến bay cụ thể | `Airline`, `Aircraft`, `Airport.code` (origin/dest) |
| `Booking` | Đơn đặt vé (nhúng `passengers[]`, `payment`) | `User`, `Flight`, `Promotion` |
| `Promotion` | Mã khuyến mãi | — |
| `PopularRoute` | Tuyến bay phổ biến hiển thị ở trang chủ (kèm ảnh nền) | `Airport.code` (origin/dest) |
| `AdminLog` | Nhật ký thao tác của quản trị viên (chỉ ghi thêm) | `User` (admin) |

Nguyên tắc nhúng (embed) vs tham chiếu (ref):
- **Ghế nhúng trong `Flight.seats[]`** — ghi chú (c): giữ/nhả ghế là 1 update atomic trên 1 document, không cần transaction, hợp với MongoDB standalone.
- **Hành khách + thông tin ghế đã chọn nhúng trong `Booking.passengers[]`** — dữ liệu chỉ thuộc về 1 booking, không tái sử dụng.
- **`payment` nhúng trong `Booking`** — vòng đời gắn chặt với booking, không cần query độc lập.
- Chỉ tách collection riêng khi dữ liệu được nhiều document khác tham chiếu (`Flight`, `Airline`, `Aircraft`, `User`).

---

## 1. `User`

```js
{
  _id: ObjectId,
  email: String,              // unique index — chống trùng dù is_blocked (C8)
  password_hash: String,      // bcrypt
  full_name: String,
  role: String,                // enum: 'customer' | 'admin', default 'customer'
  is_blocked: Boolean,         // default false — check lại trực tiếp từ DB mỗi hành động nhạy cảm (ghi chú q)
  preferred_language: String,  // enum: 'vi' | 'en', default 'vi' — C11
  password_changed_at: Date,   // lần đổi/đặt lại mật khẩu gần nhất — phiên đăng nhập cấp trước đó hết hiệu lực (C8b)
  password_reset_token_hash: String, // SHA-256 của token quên mật khẩu (select: false), null khi không có
  password_reset_expires: Date,      // hạn dùng token (30 phút)
  password_reset_requested_at: Date, // chống gửi lại link liên tục (60 giây / email)
  created_at: Date,
  updated_at: Date,
}
```

**Index:**
- `{ email: 1 }` — `unique: true` (lớp bảo vệ cuối chống race-condition đăng ký trùng — C8).

**Validate ở service (không phải schema):** đăng ký từ chối nếu `User.findOne({ email })` đã tồn tại, bất kể `is_blocked`.

---

## 2. `Airport`

*Chỉ seed qua script từ AirLabs, không có trang admin riêng (mục 6).*

```js
{
  _id: ObjectId,
  code: String,          // IATA code, unique — VD "HAN", "SGN"
  name: {
    vi: String,
    en: String,
  },
  city: String,
  country: String,
}
```

**Index:** `{ code: 1 }` — `unique: true`.

---

## 3. `Airline`

```js
{
  _id: ObjectId,
  code: String,           // IATA/ICAO code, unique
  name: {
    vi: String,           // AirLabs không trả tiếng Việt → bổ sung tay khi seed (A2)
    en: String,
  },
  created_at: Date,
  updated_at: Date,
}
```

**Index:** `{ code: 1 }` — `unique: true`.

---

## 4. `Aircraft`

```js
{
  _id: ObjectId,
  name: String,                 // VD "Airbus A321"
  total_seats: Number,
  seat_map_template: [
    {
      seat_number: String,      // VD "1A", "12C"
      seat_class: String,       // enum: 'economy' | 'business'
    }
  ],
  created_at: Date,
  updated_at: Date,
}
```

**Ghi chú quan trọng (ghi chú u + mục 6):**
- `seat_map_template` là **nguồn duy nhất** để sinh `Flight.seats[]` — admin tạo `Flight` không nhập tay ghế.
- Khi triển khai, API admin tạo/sửa `Aircraft` có validate cơ bản `seat_map_template`: không trùng `seat_number`, đúng định dạng `^[0-9A-Za-z_-]{1,8}$`, đúng `seat_class`, và nếu có `total_seats` thì phải bằng số ghế (xem ghi chú aq ở tài liệu chức năng). Việc đảm bảo số ghế đúng với thực tế máy bay vẫn do admin.

---

## 5. `Flight`

```js
{
  _id: ObjectId,
  flight_number: String,
  airline_id: ObjectId,          // ref: Airline
  aircraft_id: ObjectId,         // ref: Aircraft — KHÔNG cho sửa sau khi tạo (A1)
  origin_code: String,           // ref: Airport.code
  dest_code: String,             // ref: Airport.code
  departure_time: Date,
  arrival_time: Date,
  base_price: {
    economy: Number,
    business: Number,            // bắt buộc nếu seats[] có ghế business (ghi chú s)
  },
  seats: [
    {
      seat_number: String,       // copy từ Aircraft.seat_map_template — deep copy (ghi chú u)
      seat_class: String,        // enum: 'economy' | 'business'
      status: String,            // enum: 'available' | 'held' | 'booked', default 'available'
      held_by: ObjectId,         // ref: User — null nếu không giữ
      held_until: Date,          // now + 30 phút — null nếu không giữ
      checked_in: Boolean,       // default false (C10)
      checked_in_at: Date,       // null cho tới khi check-in
      boarding_pass_code: String,// null cho tới khi check-in
    }
  ],
  status: String,                 // enum: 'scheduled' | 'cancelled', default 'scheduled'
  created_at: Date,
  updated_at: Date,
}
```

**Index:**
- `{ origin_code: 1, dest_code: 1, departure_time: 1 }` — compound index phục vụ tìm kiếm C1.

**Ràng buộc validate ở tầng service (ghi chú s, A1):**
- `origin_code !== dest_code`.
- `arrival_time > departure_time`.
- Nếu tồn tại ít nhất 1 phần tử `seats[]` có `seat_class: 'business'` → `base_price.business` bắt buộc có giá trị.
- Không cho `PUT` (code dùng `PATCH`) đổi `departure_time`/`aircraft_id` (và khi triển khai: `arrival_time`, `origin_code`, `dest_code` — chỉ khi giá trị thực sự đổi; `base_price` không bị chặn, xem ghi chú v) hoặc `DELETE` nếu tồn tại `Booking` có `flights.flight_id` = flight này **và** `status ∈ ['pending_payment', 'confirmed']` (chỉ tính booking còn hiệu lực).
- `PUT` luôn từ chối nếu body chứa `aircraft_id` khác giá trị hiện tại, bất kể có booking hay không.

**Update atomic khi giữ ghế (C5, ghi chú c):**
```js
// hold-seat: chỉ thành công nếu ghế đang available
db.flights.updateOne(
  { _id: flightId, "seats.seat_number": seatNumber, "seats.status": "available" },
  { $set: {
      "seats.$.status": "held",
      "seats.$.held_by": userId,
      "seats.$.held_until": new Date(Date.now() + 30*60*1000),
  }}
)
```

> **Bổ sung (ghi chú ae, af):** điều kiện thực tế của hold-seat còn nhận ghế `held` đã quá `held_until` (coi như trống); ghế `held` do chính user đó giữ còn hạn được gọi lại nhưng **không gia hạn** (idempotent); thêm giới hạn 20 ghế `held` còn hạn mỗi user. `seat_number` được kiểm tra là chuỗi ngắn (`^[0-9A-Za-z_-]{1,8}$`) trước khi đưa vào query (ghi chú al).

**Update atomic chuyển ghế `held → booked` khi IPN VNPay báo thành công (C6):**
```js
// Chạy cho từng (flight_id, seat_number) trong Booking.passengers[].seats[]
const result = await db.flights.updateOne(
  { _id: flightId, "seats.seat_number": seatNumber, "seats.status": "held", "seats.held_by": userId },
  { $set: { "seats.$.status": "booked" } }
)
// Nếu modifiedCount === 0 với BẤT KỲ ghế nào trong booking → ghế đã bị cron nhả
// (quá 30 phút + đệm 5 phút, ghi chú y) hoặc bị người khác giữ/đặt trước đó.
// KHÔNG được set Booking.status = "confirmed" trong trường hợp này — chuyển
// Booking.status = "payment_error_manual_refund" (xem ghi chú y, A3) thay vì retry
// hay bỏ qua ghế đó, vì tiền đã bị trừ thật qua VNPay.
```

**Cron job nhả ghế quá hạn (Giai đoạn 6, mục 10) — bắt buộc dùng `arrayFilters`:**
```js
// BẪY: toán tử vị trí "$" trong $set chỉ cập nhật ĐÚNG 1 phần tử đầu tiên khớp điều kiện
// trong mảng seats[] của MỖI document. Nếu 1 Flight có nhiều ghế held quá hạn cùng lúc
// (VD 1 khách giữ 3 ghế cho cả gia đình rồi bỏ ngang), dùng "seats.$.status" sẽ CHỈ nhả
// được 1 trong 3 ghế đó, 2 ghế còn lại bị bỏ sót mãi ở trạng thái "held".
// Bắt buộc dùng arrayFilters để nhả TOÀN BỘ phần tử khớp điều kiện trong 1 lệnh:
await db.flights.updateMany(
  { "seats.status": "held", "seats.held_until": { $lt: new Date() } },
  { $set: {
      "seats.$[elem].status": "available",
      "seats.$[elem].held_by": null,
      "seats.$[elem].held_until": null,
    }
  },
  { arrayFilters: [{ "elem.status": "held", "elem.held_until": { $lt: new Date() } }] }
);
```

**Deep copy khi tạo Flight (A1, ghi chú u):**
```js
flight.seats = structuredClone(aircraft.seat_map_template).map(s => ({
  seat_number: s.seat_number,
  seat_class: s.seat_class,
  status: "available",
  held_by: null,
  held_until: null,
  checked_in: false,
  checked_in_at: null,
  boarding_pass_code: null,
}));
// TUYỆT ĐỐI KHÔNG: flight.seats = aircraft.seat_map_template
```

---

## 6. `Booking`

Đây là collection phức tạp nhất — nhúng `passengers[]`, `flights[]` (tóm tắt từng chặng), `payment`.

```js
{
  _id: ObjectId,
  booking_code: String,          // sinh sau khi thanh toán thành công (C7) — unique, sparse
  user_id: ObjectId,              // ref: User — bắt buộc (không guest checkout, ghi chú a)
  trip_type: String,              // enum: 'one_way' | 'round_trip'
  locale: String,                 // enum: 'vi' | 'en' — chụp lại User.preferred_language lúc đặt (C7, C10)

  flights: [
    {
      flight_id: ObjectId,        // ref: Flight
      leg: String,                // enum: 'outbound' | 'return'
      amount: Number,             // = Σ (giá theo seat_class từng khách trên chặng này) — ghi chú t; đã trừ phần chia giảm giá nếu có (ghi chú am)
    }
  ],

  passengers: [
    {
      full_name: String,
      document_type: String,    // enum: 'cccd' | 'passport' | 'birth_certificate' (ghi chú aa)
      document_id: String,      // trường String chung — lưu số CCCD/số hộ chiếu/số giấy khai sinh tùy document_type
      date_of_birth: Date,
      seats: [
        {
          flight_id: ObjectId,    // ref: Flight — 1 phần tử / chặng
          seat_number: String,
          seat_class: String,     // enum: 'economy' | 'business' — gắn theo TỪNG khách (ghi chú m)
        }
      ],
    }
  ],

  promotion_id: ObjectId,          // ref: Promotion — null nếu không dùng mã
  contact: {                       // người liên hệ (C4) — vé điện tử gửi về contact.email
    email: String,                 // đã chuẩn hóa chữ thường
    phone: String,                 // 9–15 chữ số, cho phép + ở đầu
  },
  total_amount: Number,            // = Σ flights[].amount (giảm giá đã chia xuống từng chặng theo tỷ lệ — ghi chú am)

  status: String,
  // enum: 'pending_payment' | 'confirmed' | 'cancelled'
  //     | 'refunded' | 'payment_error_manual_refund'

  payment: {
    method: String,                // 'vnpay'
    transaction_id: String,        // unique + sparse — chống thanh toán trùng (ghi chú i)
    paid_at: Date,
    payment_expires_at: Date,      // = held_until − 5 phút (đệm chống race-condition, ghi chú y)
    last_order_id: String,         // vnp_TxnRef của lần tạo thanh toán VNPay gần nhất
    last_order_date: String,       // vnp_CreateDate (yyyyMMddHHmmss) của lần đó — API truy vấn querydr bắt buộc gửi kèm
    extra_payments: [              // khoản thanh toán THỪA (khách trả 2 lần cho 1 booking) — admin hoàn tay (ghi chú ad)
      { trans_id: String, order_id: String, amount: Number, received_at: Date }
    ],
  },

  // --- Các field phục vụ hủy vé tự động (ghi chú x) ---
  cancel_reason: String,           // khách nhập (C9) hoặc admin nhập (A8) — không bắt buộc với C9
  refund_amount: Number,
  cancellation_fee_amount: Number,
  cancellation_tier: String,       // enum: 'full' | 'fixed_fee' | 'none' | 'partial'
  refund_processed_at: Date,

  created_at: Date,
  updated_at: Date,
}
```

**Index:**
- `{ "payment.transaction_id": 1 }` — `unique: true, sparse: true` (ghi chú i — nhiều booking chưa thanh toán sẽ có field này = null/không tồn tại, `sparse` để không đụng constraint unique).
- `{ booking_code: 1 }` — `unique: true, sparse: true` (chỉ tồn tại sau khi thanh toán thành công).
- `{ user_id: 1, created_at: -1 }` — phục vụ `GET /api/bookings/my` (C9).
- `{ "flights.flight_id": 1, status: 1 }` — phục vụ kiểm tra "còn booking hiệu lực" trước khi admin sửa/xóa Flight (A1) và xử lý hàng loạt khi hủy chuyến (A8). **Giữ nguyên dạng compound (không rút về single-field)**: vì `flights.flight_id` đứng trước trong index, MongoDB dùng nó làm tiền tố (leftmost prefix) — truy vấn A8 (`find({ "flights.flight_id": flightId })`, không lọc `status`) vẫn dùng được index này với hiệu năng tương đương index đơn, đồng thời A1 (`status: { $in: [...] }`) được lọc ngay ở tầng index thay vì phải quét thêm. Đây là compound multikey index hợp lệ (chỉ 1 trong 2 field là mảng — `flights.flight_id`; MongoDB chỉ cấm compound multikey khi có ≥2 field đều là mảng), nên không có rủi ro kỹ thuật khi giữ `status` trong index.

**Validate schema mức field:**
- `passengers[].seats.length` phải khớp đúng số chặng (`flights.length`) — ghi chú C4.
- `passengers[].seats[].seat_class` do client gửi lên **phải đối chiếu lại** với `Flight.seats[seat_number].seat_class` thật ở tầng service khi tạo booking — không tin dữ liệu client (ghi chú o).
- `passengers[].document_type` / `document_id` — validate theo độ tuổi ở tầng service khi tạo booking, **không phải ràng buộc cứng ở tầng schema** (vì quy tắc phụ thuộc `date_of_birth` của cùng hành khách, Mongoose schema thuần khó diễn đạt điều kiện chéo field gọn gàng) — ghi chú aa:

```js
const ageInYears = Math.floor(
  (new Date() - new Date(passenger.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)
);

if (ageInYears >= 14) {
  if (!passenger.document_id) {
    throw new Error("Hành khách từ 14 tuổi trở lên bắt buộc phải nhập số giấy tờ tùy thân.");
  }
  if (!["cccd", "passport"].includes(passenger.document_type)) {
    throw new Error("Hành khách từ 14 tuổi trở lên phải dùng CCCD hoặc Hộ chiếu.");
  }
}
// Dưới 14 tuổi: chấp nhận document_type = 'birth_certificate',
// KHÔNG bắt buộc document_id đúng cấu trúc 12 số như CCCD người lớn.
// Không ảnh hưởng tới amount/giá vé — giá vẫn tính phẳng theo seat_class (mục 6 tài liệu chức năng).
```

**Công thức tính `flights[].amount` (ghi chú t):**
```
flights[i].amount = Σ (với mỗi hành khách có seats[] chứa flight_id = flights[i].flight_id)
                       base_price[seat_class_của_khách_đó]
```
VD: 2 khách economy + 1 khách business cùng 1 chặng
→ `amount = 2 × base_price.economy + 1 × base_price.business`.

**`total_amount`:**
```
total_amount = Σ flights[].amount − giảm_giá(promotion_id)
```

**Vòng đời `status`:**
```
pending_payment ──(thanh toán OK)──► confirmed ──(khách/admin hủy, đã thanh toán)──► refunded
      │                                    │
      └──(hết hạn giữ ghế / VNPay thất bại)   └──(race-condition webhook, ghi chú y)──► payment_error_manual_refund
      ▼
   cancelled
```
- `pending_payment → cancelled`: cron job quét `payment_expires_at` quá hạn (ghi chú f), **hoặc** IPN VNPay báo `failed` trước 30 phút — xử lý ngay trong webhook, không đợi cron (C6).
- `confirmed → refunded`: qua `PATCH /api/bookings/[id]/cancel` (C9/A3) — tự động tính `refund_amount` theo mốc giờ (A7, xem 3 trường hợp TH1/TH2/TH3 ở ghi chú w), hoặc qua `PATCH /api/admin/flights/[id]/cancel-bookings` (A8 — hủy hàng loạt do hãng hủy chuyến, hoàn 100% trừ phần chặng đã bay).
- `confirmed → payment_error_manual_refund`: chỉ xảy ra khi IPN VNPay báo thành công nhưng ghế đã mất (ghi chú y) — admin xử lý tay `refund_amount` (ngoại lệ duy nhất, A3).
- **Chặn hủy** nếu bất kỳ ghế nào trong booking đã `checked_in: true` (ghi chú l) — áp dụng cho C9, **không** áp dụng cho A8 (hãng hủy chuyến do sự cố khách quan).

---

## 7. `Promotion`

```js
{
  _id: ObjectId,
  code: String,               // unique
  discount_percent: Number,
  valid_from: Date,
  valid_until: Date,
  usage_limit: Number,        // null/undefined = không giới hạn (ghi chú p)
  used_count: Number,         // default 0
  created_at: Date,
  updated_at: Date,
}
```

**Index:** `{ code: 1 }` — `unique: true`.

**Update atomic chống vượt hạn mức (ghi chú p):**
```js
// Có giới hạn → check điều kiện
db.promotions.updateOne(
  { code, usage_limit: { $exists: true, $ne: null }, $expr: { $lt: ["$used_count", "$usage_limit"] } },
  { $inc: { used_count: 1 } }
)
// Không giới hạn → tăng thẳng, KHÔNG so sánh used_count < usage_limit (usage_limit rỗng sẽ chặn nhầm)
// "Để trống" có thể là field không tồn tại HOẶC tồn tại nhưng = null — phải check cả 2,
// chỉ $exists: false sẽ bỏ sót trường hợp usage_limit lưu giá trị null tường minh.
db.promotions.updateOne(
  { code, $or: [ { usage_limit: { $exists: false } }, { usage_limit: null } ] },
  { $inc: { used_count: 1 } }
)
```
- Khi booking dùng mã bị hủy → **không** giảm lại `used_count` (đánh đổi có chủ đích, tránh race condition — ghi chú p).

---

## 7b. `PopularRoute`

*Bổ sung khi triển khai — không thuộc danh sách chức năng C/A gốc. Danh sách "Tuyến bay phổ biến" dạng carousel ở trang chủ khách; admin quản lý ở Admin → Chuyến bay → tab "Tuyến phổ biến".*

```js
{
  _id: ObjectId,
  origin_code: String,     // ref: Airport.code — uppercase
  dest_code: String,       // ref: Airport.code — uppercase, khác origin_code (pre-validate)
  active: Boolean,         // default true — false = ẩn khỏi trang chủ
  sort_order: Number,      // default 0 — thứ tự hiển thị
  image: {                 // tùy chọn — ảnh nền lưu ngay trong MongoDB
    data: Buffer,          // select: false — chỉ route ảnh mới lấy ra
    content_type: String,  // JPEG/PNG/WebP, xác định bằng magic bytes (lib/imageSniff.js)
    size: Number,          // tối đa 1MB
    updated_at: Date,      // dùng làm version cache-busting cho URL ảnh
  },
  created_at: Date,
  updated_at: Date,
}
```

**Index:**
- `{ origin_code: 1, dest_code: 1 }` — `unique: true` (mỗi tuyến chỉ xuất hiện 1 lần).
- `{ sort_order: 1 }` — sắp xếp danh sách.

**Ghi chú thiết kế:**
- **Collection rỗng = chưa tùy chỉnh**: trang chủ dùng danh sách mặc định trong `lib/popularRoutes.js`. Admin phải bấm "nạp mặc định" (`POST /api/admin/popular-routes/defaults`) rồi mới thêm/sửa — tránh việc thêm 1 tuyến vào collection rỗng làm trang chủ chỉ còn đúng 1 tuyến.
- **Ảnh lưu trong DB, không ghi file**: để chạy được cả trên host không cho ghi đĩa. `image.data` đặt `select: false` để danh sách/trang chủ không kéo dữ liệu nhị phân.
- **Không lưu giá hay chuyến gần nhất**: "Giá từ ..." và chuyến sắp bay luôn tính từ `Flight` thật (`services/routeStatsService.js`), tránh dữ liệu lệch.
- **API**: `GET/POST /api/admin/popular-routes`, `PATCH/DELETE /api/admin/popular-routes/[id]`, `PUT/DELETE /api/admin/popular-routes/[id]/image`, `POST /api/admin/popular-routes/defaults` (admin); `GET /api/popular-routes/[id]/image` (công khai).

---

## 7c. `AdminLog`

*Bổ sung khi triển khai (A9). Chỉ ghi thêm — không có API sửa/xóa.*

```js
{
  _id: ObjectId,
  admin_id: ObjectId,       // ref: User (role admin)
  admin_email: String,      // chụp lại lúc thao tác
  action: String,           // enum, VD 'booking.cancel', 'booking.manual_refund', 'user.block', 'flight.cancel_bulk'...
  target_type: String,      // 'flight' | 'booking' | 'user' | 'promotion' | 'aircraft' | 'airline' | 'popular_route'
  target_id: String,        // id đối tượng bị tác động (null nếu không có)
  summary: String,          // mô tả ngắn tiếng Việt
  details: Object,          // chi tiết rút gọn (bỏ mật khẩu/token, mảng chỉ ghi số phần tử)
  created_at: Date,
}
```

**Index:** `{ created_at: -1 }`, `{ action: 1, created_at: -1 }`, `{ target_type: 1, target_id: 1 }`.

---

## 8. Bảng tổng hợp Index

| Collection | Index | Loại |
|---|---|---|
| `User` | `{ email: 1 }` | unique |
| `Airport` | `{ code: 1 }` | unique |
| `Airline` | `{ code: 1 }` | unique |
| `Flight` | `{ origin_code: 1, dest_code: 1, departure_time: 1 }` | compound |
| `Booking` | `{ "payment.transaction_id": 1 }` | unique + sparse |
| `Booking` | `{ booking_code: 1 }` | unique + sparse |
| `Booking` | `{ user_id: 1, created_at: -1 }` | compound |
| `Booking` | `{ "flights.flight_id": 1, status: 1 }` | compound |
| `Promotion` | `{ code: 1 }` | unique |
| `PopularRoute` | `{ origin_code: 1, dest_code: 1 }` | unique |
| `PopularRoute` | `{ sort_order: 1 }` | single |
| `User` | `{ password_reset_token_hash: 1 }` | sparse |
| `AdminLog` | `{ created_at: -1 }`, `{ action: 1, created_at: -1 }`, `{ target_type: 1, target_id: 1 }` | single / compound |

## 9. Bảng tổng hợp Enum

| Field | Giá trị |
|---|---|
| `User.role` | `customer`, `admin` |
| `User.preferred_language` | `vi`, `en` |
| `Aircraft.seat_map_template[].seat_class` / `Flight.seats[].seat_class` | `economy`, `business` |
| `Flight.seats[].status` | `available`, `held`, `booked` |
| `Flight.status` | `scheduled`, `cancelled` |
| `Booking.trip_type` | `one_way`, `round_trip` |
| `Booking.flights[].leg` | `outbound`, `return` |
| `Booking.status` | `pending_payment`, `confirmed`, `cancelled`, `refunded`, `payment_error_manual_refund` |
| `Booking.cancellation_tier` | `full`, `fixed_fee`, `none`, `partial` |
| `Booking.passengers[].document_type` | `cccd`, `passport`, `birth_certificate` |

## 10. Lưu ý triển khai chung (áp cho toàn bộ schema)

- **Xác nhận thanh toán dùng update có điều kiện** (đặt ghế `held → booked` từng ghế, rồi chốt `status` + `payment.transaction_id` bằng 1 `findOneAndUpdate` có điều kiện `status: pending_payment`, ghi chú ao) thay cho transaction — vẫn phù hợp MongoDB standalone.
- **Không dùng MongoDB Transaction** ở bất kỳ đâu — mọi thao tác nhạy cảm (giữ ghế, nhả ghế, tăng `used_count`) đều thiết kế thành **1 update atomic trên đúng 1 document**, phù hợp chế độ standalone.
- **`is_blocked` check-lại trực tiếp từ DB** (không chỉ dựa session) tại mọi hành động nhạy cảm: giữ ghế, tạo booking, thanh toán (ghi chú q) — không phải là 1 field mới, mà là quy tắc gọi `User.findById` lại trong middleware `requireActiveUser`.
- **Cron job (Giai đoạn 6)** cần 2 việc độc lập: (1) quét `Flight.seats[]` có `held_until` quá hạn → nhả về `available` — **bắt buộc dùng `updateMany` + `arrayFilters`** (xem snippet ở mục 5 `Flight`), không dùng toán tử vị trí `$` đơn thuần vì nó chỉ nhả được 1 ghế đầu tiên khớp điều kiện trong mỗi document, bỏ sót các ghế held quá hạn còn lại nếu 1 khách từng giữ nhiều ghế cùng lúc; (2) quét `Booking.payment.payment_expires_at` quá hạn ở trạng thái `pending_payment` → chuyển `cancelled`.
- **Giới hạn đã thêm (chi tiết ở tài liệu chức năng, ghi chú ac–as):** tối đa 20 ghế giữ/user và 3 booking `pending_payment`/user; xác minh IPN VNPay bằng chữ ký riêng của merchant + `vnp_TmnCode` + số tiền, và trang kết quả tự hỏi lại VNPay (`querydr`) thay vì tin tham số trên URL; khóa đăng nhập tạm; kiểm tra quyền ở từng trang.
- **Không sửa lại `flights[].amount` lịch sử** khi tính phí hủy — giữ nguyên để phục vụ báo cáo doanh thu A6 (ghi chú t, A7).
- **Múi giờ (Timezone):** `Date` trong MongoDB lưu dạng UTC. Khi tính `elapsed_hours` (A7) hoặc khung giờ check-in (C10), ép `departure_time`/thời điểm hiện tại về `Asia/Ho_Chi_Minh` bằng `dayjs`/`moment-timezone` trước khi so sánh — tránh lệch GMT+7 dẫn tới tính sai mốc phạt hủy/khung check-in (ghi chú ab).
