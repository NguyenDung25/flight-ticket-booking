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

/** Danh sách AirLabs -> các chuyến bay khai thác thật, sắp theo giờ cất cánh (giờ VN). */
function normalizeSchedules(rows) {
  const seen = new Set();
  const schedules = [];
  for (const s of Array.isArray(rows) ? rows : []) {
    if (!s || !s.flight_iata || !s.dep_time_utc || !s.arr_time_utc) continue;
    if (s.cs_flight_iata) continue;
    const depVN = toVNInput(s.dep_time_utc);
    const arrVN = toVNInput(s.arr_time_utc);
    if (!depVN || !arrVN) continue;
    const key = `${s.flight_iata}|${depVN.slice(11)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    schedules.push({ flight_iata: s.flight_iata, airline_iata: s.airline_iata ?? null, dep_vn: depVN, arr_vn: arrVN });
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

module.exports = { CACHE_TTL_MS, toVNInput, normalizeSchedules, getCachedSchedules, setCachedSchedules };
