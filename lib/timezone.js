// lib/timezone.js
//
// Ghi chú (ab): MongoDB lưu Date dạng UTC. Mọi so sánh mốc thời gian liên quan
// tới departure_time (phí hủy A7, khung check-in C10) BẮT BUỘC đi qua file này
// — không so sánh trực tiếp `new Date()` với `flight.departure_time` ở nơi khác,
// tránh lệch giờ nếu server host chạy ở múi giờ khác GMT+7.

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const {
  CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE,
  CHECK_IN_CLOSES_HOURS_BEFORE_DEPARTURE,
} = require("../config/constants");

dayjs.extend(utc);
dayjs.extend(timezone);

const VN_TZ = "Asia/Ho_Chi_Minh";

/** Trả về thời điểm hiện tại, đã gắn múi giờ VN. */
function nowVN() {
  return dayjs().tz(VN_TZ);
}

/** Ép 1 giá trị Date/ISOString bất kỳ về mốc thời gian theo múi giờ VN. */
function toVN(date) {
  return dayjs(date).tz(VN_TZ);
}

/**
 * Số giờ còn lại (có thể âm nếu đã qua) từ `now` tới `departureTime`.
 * Dùng cho A7 (elapsed_hours) và C10 (khung check-in).
 */
function hoursUntil(departureTime, from = new Date()) {
  return toVN(departureTime).diff(toVN(from), "hour", true); // true = giữ số thập phân
}

/**
 * Tuổi tính theo năm dương lịch tại thời điểm `at` (mặc định = hiện tại),
 * dùng cho validate document_type/document_id ở C4 (ghi chú aa).
 */
function ageInYears(dateOfBirth, at = new Date()) {
  const birth = toVN(dateOfBirth);
  const ref = toVN(at);
  let age = ref.year() - birth.year();
  // Nếu chưa tới "sinh nhật" trong năm hiện tại thì trừ đi 1
  const hasHadBirthdayThisYear =
    ref.month() > birth.month() ||
    (ref.month() === birth.month() && ref.date() >= birth.date());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * C1 (tìm kiếm chuyến bay) — trả về khoảng [start, end) tương ứng đúng 1 ngày
 * dương lịch THEO GIỜ VN của `dateInput` (VD "2026-09-20"), dùng để query
 * `departure_time` bằng `{ $gte: start, $lt: end }`. BẮT BUỘC đi qua hàm này
 * thay vì tự `new Date(dateInput)` — nếu server host chạy ở múi giờ khác
 * GMT+7, mốc 00:00 sẽ lệch ngày, khiến chuyến bay khởi hành cuối/đầu ngày bị
 * tìm sót hoặc lẫn sang ngày kế bên (đúng tinh thần ghi chú ab).
 */
function dayRangeVN(dateInput) {
  const start = dayjs.tz(dateInput, VN_TZ).startOf("day");
  const end = start.add(1, "day");
  return { start: start.toDate(), end: end.toDate() };
}

/**
 * Khung check-in (C10): mở trước giờ bay 24h, đóng trước giờ bay 2h.
 * Không lưu field riêng — luôn tính động từ departure_time.
 */
function isCheckInWindowOpen(departureTime, from = new Date()) {
  const hoursLeft = hoursUntil(departureTime, from);
  return (
    hoursLeft <= CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE &&
    hoursLeft >= CHECK_IN_CLOSES_HOURS_BEFORE_DEPARTURE
  );
}

module.exports = {
  VN_TZ,
  nowVN,
  toVN,
  hoursUntil,
  ageInYears,
  dayRangeVN,
  isCheckInWindowOpen,
};