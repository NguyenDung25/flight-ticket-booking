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

/** Số giờ còn lại (có thể âm nếu đã qua) từ `now` tới `departureTime`. */
function hoursUntil(departureTime, from = new Date()) {
  return toVN(departureTime).diff(toVN(from), "hour", true); // true = giữ số thập phân
}

/** Tuổi tính theo năm dương lịch tại thời điểm `at` (mặc định = hiện tại). */
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

/** C1 (tìm kiếm chuyến bay) — trả về khoảng [start. */
function dayRangeVN(dateInput) {
  const start = dayjs.tz(dateInput, VN_TZ).startOf("day");
  const end = start.add(1, "day");
  return { start: start.toDate(), end: end.toDate() };
}

/** Ngày hôm nay theo giờ VN, dạng "YYYY-MM-DD". */
function todayStringVN() {
  return nowVN().format("YYYY-MM-DD");
}

/** true nếu `value` là chuỗi "YYYY-MM-DD" đúng định dạng và là ngày có thật (không có 2026-02-31). */
function isValidYmd(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Khung check-in (C10): mở trước giờ bay 24h, đóng trước giờ bay 2h. */
function isCheckInWindowOpen(departureTime, from = new Date()) {
  const hoursLeft = hoursUntil(departureTime, from);
  return (
    hoursLeft <= CHECK_IN_OPENS_HOURS_BEFORE_DEPARTURE &&
    hoursLeft >= CHECK_IN_CLOSES_HOURS_BEFORE_DEPARTURE
  );
}

/** Trạng thái khung check-in để hiển thị (C10): "not_yet_open" (còn hơn 24h), "open", hoặc "closed". */
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

/** Khoảng [start, end) của 1 tháng theo giờ VN: start = 00:00 ngày 1 giờ VN, end = 00:00 ngày 1 tháng sau. */
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