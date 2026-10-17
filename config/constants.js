// ---- C5 (mục a) — Giữ ghế tạm thời khi khách chọn ghế ----
const SEAT_HOLD_DURATION_MINUTES = 30;
const SEAT_HOLD_DURATION_MS = SEAT_HOLD_DURATION_MINUTES * 60 * 1000;

// ---- C6 (ghi chú y) — Đệm thời gian chống race-condition với IPN VNPay ---- payment_expires_at = held_until −…
const PAYMENT_EXPIRY_BUFFER_MINUTES = 5;
const PAYMENT_EXPIRY_BUFFER_MS = PAYMENT_EXPIRY_BUFFER_MINUTES * 60 * 1000;

// ---- A7/C9 (ghi chú j) — Phí hủy vé do khách chủ động hủy.
const CANCELLATION_FULL_REFUND_THRESHOLD_HOURS = 24;
const CANCELLATION_FIXED_FEE_THRESHOLD_HOURS = 3;
// Phí mỗi hành khách theo hạng ghế của khách (đồng).
const CANCELLATION_FEES = Object.freeze({
  economy: Object.freeze({ early: 300_000, mid: 600_000, late: null }),
  business: Object.freeze({ early: 0, mid: 300_000, late: 650_000 }),
});

// ---- C6 (ghi chú z) — Transit tối thiểu giữa chặng đi và chặng về (khứ hồi) ----
const MIN_ROUND_TRIP_TRANSIT_HOURS = 2;
const MIN_ROUND_TRIP_TRANSIT_MS = MIN_ROUND_TRIP_TRANSIT_HOURS * 60 * 60 * 1000;

// ---- C10 (ghi chú k) — Khung giờ check-in online, tính theo departure_time ----
const CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE = 24;
const CHECK_IN_CLOSES_HOURS_BEFORE_DEPARTURE = 2;
// Giờ bắt đầu lên máy bay in trên thẻ lên máy bay = giờ khởi hành − mốc này.
const BOARDING_STARTS_MINUTES_BEFORE_DEPARTURE = 40;

// ---- C4 (ghi chú aa) — Ngưỡng tuổi bắt buộc CCCD/Hộ chiếu ----
const MIN_AGE_REQUIRE_ID_DOCUMENT = 14;

// ---- Giới hạn đầu vào (chống số lượng/ngày vô lý, kể cả khi gọi API trực tiếp) ----
const MAX_PASSENGERS_PER_BOOKING = 9; // khớp tùy chọn 1–9 ở form tìm kiếm
const MAX_PASSENGER_AGE_YEARS = 120;

// ---- Giới hạn số tiền 1 giao dịch VNPay (vnđ) — VNPay nhận từ 5.000đ đến dưới 1 tỷ đồng ----
const PAYMENT_MIN_AMOUNT = 5_000;
const PAYMENT_MAX_AMOUNT = 999_999_999;

// ---- Chống chiếm ghế / đốt mã khuyến mãi bằng cách giữ & tạo booking hàng loạt ---- 2 chặng x 9 hành khách =…
const MAX_HELD_SEATS_PER_USER = 20;
const MAX_PENDING_BOOKINGS_PER_USER = 3;

// ---- Cron job (Giai đoạn 6) — tần suất quét ghế held quá hạn ----
const CRON_SCHEDULE_EVERY_MINUTE = "* * * * *";

// ---- C8 (ghi chú đăng ký/đăng nhập) — độ mạnh hash mật khẩu bcrypt ---- 10 là mức khuyến nghị phổ biến.
const BCRYPT_SALT_ROUNDS = 10;

// ---- C7 (xuất vé điện tử) — độ dài & số lần thử sinh booking_code ----
const BOOKING_CODE_LENGTH = 6;
const BOOKING_CODE_MAX_GENERATION_ATTEMPTS = 5;

// ---- C10 (check-in online) — độ dài mã boarding_pass_code ---- Dài hơn booking_code (6) vì đây là mã quét/in.
const BOARDING_PASS_CODE_LENGTH = 8;

module.exports = {
  PAYMENT_MIN_AMOUNT,
  PAYMENT_MAX_AMOUNT,
  MAX_HELD_SEATS_PER_USER,
  MAX_PENDING_BOOKINGS_PER_USER,
  SEAT_HOLD_DURATION_MINUTES,
  SEAT_HOLD_DURATION_MS,
  PAYMENT_EXPIRY_BUFFER_MINUTES,
  PAYMENT_EXPIRY_BUFFER_MS,
  CANCELLATION_FULL_REFUND_THRESHOLD_HOURS,
  CANCELLATION_FIXED_FEE_THRESHOLD_HOURS,
  CANCELLATION_FEES,
  MIN_ROUND_TRIP_TRANSIT_HOURS,
  MIN_ROUND_TRIP_TRANSIT_MS,
  CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE,
  CHECK_IN_CLOSES_HOURS_BEFORE_DEPARTURE,
  BOARDING_STARTS_MINUTES_BEFORE_DEPARTURE,
  MIN_AGE_REQUIRE_ID_DOCUMENT,
  MAX_PASSENGERS_PER_BOOKING,
  MAX_PASSENGER_AGE_YEARS,
  CRON_SCHEDULE_EVERY_MINUTE,
  BCRYPT_SALT_ROUNDS,
  BOOKING_CODE_LENGTH,
  BOOKING_CODE_MAX_GENERATION_ATTEMPTS,
  BOARDING_PASS_CODE_LENGTH,
};