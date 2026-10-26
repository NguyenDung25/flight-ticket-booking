const { toVN } = require("./timezone");

// Lịch bay 1 tuyến ít thay đổi trong ngày; gói free của AirLabs chỉ có 1.000 request/tháng nên lưu tạm kết quả…
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED_ROUTES = 500;

/** "YYYY-MM-DD HH:mm" (UTC, định dạng AirLabs) -> "YYYY-MM-DDTHH:mm" giờ VN (input datetime-local). */
function toVNInput(utcString) {
  // Kiểm tra định dạng trước khi parse: new Date() của V8 "đoán" cả chuỗi rác.
  if (typeof utcString !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(utcString)) return null;
  const d = new Date(`${utcString.replace(" ", "T")}:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return toVN(d).format("YYYY-MM-DDTHH:mm");
}

/**
 * Danh sách AirLabs -> các chuyến bay khai thác thật, sắp theo giờ cất cánh (giờ VN).
 * airports (tùy chọn): mã sân bay của hệ thống — bỏ chuyến có đầu kia ngoài danh sách (VD chuyến quốc tế).
 */
function normalizeSchedules(rows, airports = null) {
  const seen = new Set();
  const schedules = [];
  for (const s of Array.isArray(rows) ? rows : []) {
    if (!s || !s.flight_iata || !s.dep_time_utc || !s.arr_time_utc) continue;
    if (s.cs_flight_iata) continue;
    if (airports && !(airports.has(s.dep_iata) && airports.has(s.arr_iata))) continue;
    const depVN = toVNInput(s.dep_time_utc);
    const arrVN = toVNInput(s.arr_time_utc);
    if (!depVN || !arrVN) continue;
    const key = `${s.flight_iata}|${s.dep_iata}|${depVN.slice(11)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    schedules.push({
      flight_iata: s.flight_iata,
      airline_iata: s.airline_iata ?? null,
      dep_iata: s.dep_iata ?? null,
      arr_iata: s.arr_iata ?? null,
      dep_vn: depVN,
      arr_vn: arrVN,
    });
  }
  schedules.sort((a, b) => a.dep_vn.slice(11).localeCompare(b.dep_vn.slice(11)));
  return schedules;
}

// Gắn vào globalThis vì Next.js có thể nạp module này nhiều lần (dev/HMR). Chỉ lưu kết quả thành công.
function store() {
  if (!globalThis.__airlabsScheduleCache) globalThis.__airlabsScheduleCache = new Map();
  return globalThis.__airlabsScheduleCache;
}

/** @returns {Array|null} lịch bay đã lưu của tuyến (null nếu chưa có hoặc đã hết hạn). Route chỉ lưu kết quả có chuyến. */
function getCachedSchedules(dep, arr, now = Date.now()) {
  const entry = store().get(`${dep}-${arr}`);
  if (!entry) return null;
  if (now - entry.at > CACHE_TTL_MS) {
    store().delete(`${dep}-${arr}`);
    return null;
  }
  return entry.schedules;
}

function setCachedSchedules(dep, arr, schedules, now = Date.now()) {
  const m = store();
  if (m.size >= MAX_CACHED_ROUTES) m.delete(m.keys().next().value);
  m.set(`${dep}-${arr}`, { at: now, schedules });
}

// Mã loại máy bay ICAO (AirLabs trả về, VD "A21N") -> tên dòng máy bay để dò trong danh sách Máy bay của hệ thống.
// Mỗi mã có thứ tự ưu tiên: biến thể cụ thể trước (A321neo), dòng chung sau (A321).
const AIRCRAFT_TYPES = {
  A319: ["A319"], A320: ["A320"], A20N: ["A320neo", "A320"], A321: ["A321"], A21N: ["A321neo", "A321"],
  A332: ["A330-200", "A330"], A333: ["A330-300", "A330"], A339: ["A330-900", "A330neo", "A330"],
  A359: ["A350-900", "A350"], A35K: ["A350-1000", "A350"],
  B737: ["737-700", "737"], B738: ["737-800", "737"], B38M: ["737 MAX 8", "737MAX", "737"],
  B788: ["787-8", "787"], B789: ["787-9", "787"], B78X: ["787-10", "787"],
  B77W: ["777-300ER", "777"], AT75: ["ATR 72", "ATR72"], AT76: ["ATR 72", "ATR72"],
  E190: ["E190"], E195: ["E195"],
};

const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Mã ICAO hợp lệ (2–4 ký tự chữ/số, viết hoa) hoặc null. */
function normalizeAircraftCode(code) {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(c) ? c : null;
}

/** Tìm máy bay trong hệ thống khớp mã loại ICAO; null nếu không có. aircraft: [{ id, name }]. */
function matchAircraft(code, aircraft) {
  const c = normalizeAircraftCode(code);
  if (!c || !Array.isArray(aircraft)) return null;
  const keys = AIRCRAFT_TYPES[c] ?? [c];
  for (const key of keys.map(squash)) {
    const hit = aircraft.find((a) => squash(a.name).includes(key));
    if (hit) return hit;
  }
  return null;
}

/** Tên dòng máy bay để hiển thị cho quản trị viên, VD "A21N" -> "A321neo". */
function aircraftLabel(code) {
  const c = normalizeAircraftCode(code);
  return c ? (AIRCRAFT_TYPES[c]?.[0] ?? c) : null;
}

// Loại máy bay theo số hiệu: lưu tạm như lịch bay để không tốn thêm lượt gọi AirLabs khi chọn lại cùng chuyến.
function flightStore() {
  if (!globalThis.__airlabsAircraftCache) globalThis.__airlabsAircraftCache = new Map();
  return globalThis.__airlabsAircraftCache;
}

function getCachedAircraft(flightIata, now = Date.now()) {
  const entry = flightStore().get(flightIata);
  if (!entry) return undefined;
  if (now - entry.at > CACHE_TTL_MS) {
    flightStore().delete(flightIata);
    return undefined;
  }
  return entry.code;
}

function setCachedAircraft(flightIata, code, now = Date.now()) {
  const m = flightStore();
  if (m.size >= MAX_CACHED_ROUTES) m.delete(m.keys().next().value);
  m.set(flightIata, { at: now, code });
}

module.exports = {
  CACHE_TTL_MS,
  toVNInput,
  normalizeSchedules,
  getCachedSchedules,
  setCachedSchedules,
  normalizeAircraftCode,
  matchAircraft,
  aircraftLabel,
  getCachedAircraft,
  setCachedAircraft,
};
