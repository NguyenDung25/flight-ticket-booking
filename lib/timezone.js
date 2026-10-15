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

/** Ngày hôm nay theo giờ VN, dạng "YYYY-MM-DD". */
function todayStringVN() {
  return nowVN().format("YYYY-MM-DD");
}

/** true nếu `value` là chuỗi "YYYY-MM-DD" đúng định dạng VÀ là ngày có thật (không có 2026-02-31). */
function isValidYmd(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
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

/**
 * Trạng thái khung check-in để HIỂN THỊ (C10): "not_yet_open" (còn hơn 24h), "open", hoặc "closed"
 * (đã qua mốc đóng 2h trước giờ bay, kể cả khi chuyến chưa cất cánh).
 */
function checkInWindowState(departureTime, from = new Date()) {
  if (isCheckInWindowOpen(departureTime, from)) return "open";
  return hoursUntil(departureTime, from) > CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE ? "not_yet_open" : "closed";
}

/** true nếu `value` là chuỗi "YYYY-MM" đúng định dạng và tháng 01–12. */
function isValidYm(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Tháng hiện tại theo giờ VN, dạng "YYYY-MM". */
function currentMonthVN() {
  return nowVN().format("YYYY-MM");
}

/**
 * Khoảng [start, end) của 1 tháng theo giờ VN: start = 00:00 ngày 1 giờ VN, end = 00:00 ngày 1 THÁNG SAU
 * (loại trừ). Dùng làm điều kiện lọc doanh thu theo tháng — không dùng new Date("YYYY-MM-01") trần vì đó là
 * 00:00 UTC = 07:00 sáng giờ VN, làm đơn thanh toán 0–7h sáng ngày 1 bị tính nhầm sang tháng trước (ghi chú ab).
 * @param {string} ym "YYYY-MM"
 */
function monthRangeVN(ym) {
  const start = dayjs.tz(`${ym}-01`, VN_TZ).startOf("month");
  return { start: start.toDate(), end: start.add(1, "month").toDate() };
}

module.exports = {
  VN_TZ,
  nowVN,
  toVN,
  hoursUntil,
  ageInYears,
  dayRangeVN,
  todayStringVN,
  isValidYmd,
  isValidYm,
  currentMonthVN,
  monthRangeVN,
  isCheckInWindowOpen,
  checkInWindowState,
};