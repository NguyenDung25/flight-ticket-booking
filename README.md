# flight-ticket-booking

Code khung Flight, Booking + Validate Service, sinh từ đúng `chuc-nang-he-thong.md` + `mongodb-schema-design.md` đã chốt. Dùng JavaScript thuần (CommonJS `require`/`module.exports` — đổi sang `import`/`export` nếu bạn dùng Next.js App Router với ES module).

## Cài dependency

```bash
npm install mongoose dayjs node-cron
```

## Cấu trúc thư mục đầy đủ của dự án (đối chiếu đủ 19 chức năng C1–C11, A1–A8)

Thư mục đã sinh trong lượt này được đánh dấu `✅ đã có`, phần còn lại là khung tham chiếu cho các tuần code sau.

```
flight-ticket-booking/
├── app/
│   ├── [locale]/                        # C11 — route theo ngôn ngữ
│   │   ├── page.js                      # trang tìm kiếm (C1)
│   │   ├── flights/[id]/page.js         # chi tiết + chọn chuyến (C3)
│   │   ├── booking/page.js              # C4 + C5 (nhập khách + chọn ghế)
│   │   ├── payment/page.js              # C6
│   │   ├── my-bookings/page.js          # C9
│   │   ├── check-in/page.js             # C10
│   │   ├── login/page.js, register/page.js   # C8
│   │   └── layout.js
│   ├── admin/                           # A1–A8, KHÔNG theo locale
│   │   ├── flights/page.js
│   │   ├── airlines-aircraft/page.js
│   │   ├── bookings/page.js
│   │   ├── users/page.js
│   │   ├── promotions/page.js
│   │   ├── stats/page.js
│   │   └── refund-log/page.js
│   └── api/
│       ├── auth/register/route.js
│       ├── auth/[...nextauth]/route.js
│       ├── flights/search/route.js              # C1
│       ├── flights/[id]/route.js                # C3
│       ├── flights/[id]/hold-seat/route.js       # C5
│       ├── flights/[id]/release-seat/route.js    # C5
│       ├── flights/[id]/check-in/route.js        # C10
│       ├── bookings/route.js                    # C6 (tạo booking)
│       ├── bookings/my/route.js                 # C9
│       ├── bookings/[id]/cancel/route.js         # C9
│       ├── bookings/[id]/ticket/route.js         # C7
│       ├── payments/[bookingId]/route.js         # C6 (webhook Momo)
│       ├── users/me/route.js                     # C8 đổi ngôn ngữ ưa thích
│       └── admin/
│           ├── flights/route.js                  # A1
│           ├── airlines/route.js, aircraft/route.js  # A2
│           ├── bookings/route.js                 # A3
│           ├── users/route.js                    # A4
│           ├── promotions/route.js               # A5
│           ├── stats/revenue/route.js            # A6
│           ├── bookings/refund-log/route.js      # A7
│           └── flights/[id]/cancel-bookings/route.js  # A8
├── models/
│   ├── User.js                                    # ✅ đã có
│   ├── Airport.js                                 # ✅ đã có
│   ├── Airline.js                                 # ✅ đã có
│   ├── Aircraft.js                                # ✅ đã có (kèm cloneSeatMapForFlight — ghi chú u)
│   ├── Flight.js                                  # ✅ đã có
│   ├── Booking.js                                 # ✅ đã có
│   └── Promotion.js                               # ✅ đã có (kèm incrementUsage — ghi chú p)
├── services/
│   ├── bookingValidationService.js               # ✅ đã có
│   ├── seatService.js                            # ✅ đã có (hold/release/confirm/forceRelease + cron dùng chung)
│   ├── cancellationService.js                    # ✅ đã có (A7/C9 3 trường hợp TH1/TH2/TH3, A8 hủy hàng loạt)
│   ├── promotionService.js                       # ✅ đã có (A5)
│   └── statsService.js                           # A6
├── lib/
│   ├── timezone.js                                # ✅ đã có
│   ├── momoClient.js                              # C6
│   ├── emailClient.js                             # C7
│   └── airlabsClient.js                           # seed + A1 autofill
├── scripts/
│   └── seedAirlabs.js                             # seed Airport/Airline ban đầu
├── cron/
│   └── releaseExpiredHolds.js                     # ✅ đã có (nhả ghế quá hạn + hủy booking quá hạn thanh toán — ghi chú f)
├── messages/
│   ├── vi.json, en.json                           # C11
├── components/                                    # UI dùng chung (form, sơ đồ ghế...)
├── middleware.js                                  # requireActiveUser + next-intl gộp chung
└── README.md
```

## Ví dụ dùng khi tạo booking (C6 — API `POST /api/bookings`)

```js
const Flight = require("./models/Flight");
const Booking = require("./models/Booking");
const { validateBookingCreation } = require("./services/bookingValidationService");

async function createBooking(req, res) {
  try {
    const { passengers, tripType, promotionId, locale, userId } = req.body;

    // 1) Lấy Flight thật từ DB cho từng chặng (KHÔNG tin flight data client gửi)
    const legFlightIds = [...new Set(passengers.flatMap((p) => p.seats.map((s) => s.flight_id)))];
    const flightDocs = await Flight.find({ _id: { $in: legFlightIds } });

    // QUAN TRỌNG: MongoDB KHÔNG đảm bảo thứ tự kết quả khớp với thứ tự mảng
    // truyền vào $in — không được gán leg theo index i như "flightDocs[0] =
    // outbound". Phải sort theo departure_time thật: chặng có giờ bay sớm hơn
    // luôn là outbound. Sai chỗ này sẽ làm cancellationService tính nhầm
    // TH1/TH2/TH3 (ghi chú w) sau này vì dựa vào đúng field `leg` này.
    const sortedByDeparture = [...flightDocs].sort(
      (a, b) => a.departure_time - b.departure_time
    );
    const legs = sortedByDeparture.map((flightDoc, i) => ({
      flightDoc,
      leg: i === 0 ? "outbound" : "return",
    }));

    // 2) Validate tuổi/giấy tờ + transit time + seat_class — ném lỗi nếu sai
    const { amounts } = await validateBookingCreation({ passengers, legs });

    // 3) Build flights[] cho Booking từ amounts đã tính
    const flights = legs.map((l) => ({
      flight_id: l.flightDoc._id,
      leg: l.leg,
      amount: amounts[String(l.flightDoc._id)],
    }));

    const totalAmountBeforeDiscount = flights.reduce((sum, f) => sum + f.amount, 0);
    // TODO: trừ giảm giá theo promotionId (dùng update atomic tăng used_count — xem ghi chú p)
    const total_amount = totalAmountBeforeDiscount;

    const booking = await Booking.create({
      user_id: userId,
      trip_type: tripType,
      locale,
      flights,
      passengers,
      promotion_id: promotionId || null,
      total_amount,
      status: "pending_payment",
    });

    return res.status(201).json(booking);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ message: err.message });
  }
}

module.exports = { createBooking };
```

## Điểm cần quyết định sớm — Cron job

Next.js không có sẵn tiến trình nền chạy liên tục — `app/api/.../route.js` chỉ chạy khi có request tới. Với đồ án demo local, có 2 cách:
1. Viết `cron/releaseExpiredHolds.js` dùng `node-cron`, chạy như 1 tiến trình Node riêng song song với `next dev` (đơn giản nhất cho demo).
2. Gọi tay lúc demo hoặc `setInterval` phía admin — không chuẩn nhưng đủ dùng nếu ghi rõ giới hạn này trong "Ngoài phạm vi đồ án".

## Còn thiếu (chưa sinh trong lượt này, nhắn nếu cần)

- `services/statsService.js` — aggregation pipeline doanh thu A6 (đã có sẵn snippet mẫu tránh nhân đôi tiền phạt trong `chuc-nang-he-thong.md`, chỉ cần bọc thành hàm + `$lookup` sang `Flight` lấy tuyến bay).
- `lib/momoClient.js`, `lib/emailClient.js`, `lib/airlabsClient.js` — client gọi API bên ngoài (Momo, gửi email, AirLabs), chưa có logic nghiệp vụ phức tạp nên có thể để làm sau cùng khi tới đúng tuần trong lịch.
- Model `Promotion.js` đã có `incrementUsage()` — `services/promotionService.js` (vừa tạo) đã gọi tới, không cần thêm gì ở tầng model nữa.

