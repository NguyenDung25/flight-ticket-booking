// lib/airlabsSchedules.js
//
// A1 — xử lý kết quả AirLabs /schedules cho nút "Tra cứu lịch bay từ AirLabs" ở form tạo chuyến bay
// (app/api/admin/airlabs/schedules/route.js). Hàm thuần + bộ nhớ đệm, không gọi mạng — để test được.

const { toVN } = require("./timezone");

// Lịch bay 1 tuyến ít thay đổi trong ngày; gói free của AirLabs chỉ có 1.000 request/tháng nên lưu
// tạm kết quả theo tuyến, bấm lại cùng tuyến trong thời gian này không tốn thêm lượt gọi.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED_ROUTES = 500;

/** "YYYY-MM-DD HH:mm" (UTC, định dạng AirLabs) -> "YYYY-MM-DDTHH:mm" giờ VN (input datetime-local). */
function toVNInput(utcString) {
  // Kiểm tra định dạng TRƯỚC khi parse: new Date() của V8 "đoán" cả chuỗi rác (VD "sai:00Z" ra
  // ngày 01/01/2000) thay vì trả Invalid Date.
  if (typeof utcString !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(utcString)) return null;
  const d = new Date(`${utcString.replace(" ", "T")}:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return toVN(d).format("YYYY-MM-DDTHH:mm");
}

/**
 * Danh sách AirLabs -> các chuyến bay KHAI THÁC thật, sắp theo giờ cất cánh (giờ VN).
 * - Bỏ chuyến codeshare (có cs_flight_iata): đó là CÙNG 1 chuyến bay nhưng mang số hiệu của hãng
 *   bán chung (VD CI8813 của China Airlines = VN213 do Vietnam Airlines khai thác) — chuyến khai thác
 *   thật đã có 1 dòng riêng trong kết quả.
 * - Bỏ trùng cùng số hiệu + giờ (AirLabs có thể lặp 1 chuyến nhiều ngày).
 * - Không cắt bớt: trả đủ mọi chuyến AirLabs đưa về. Lưu ý: /schedules của AirLabs chỉ trả các chuyến
 *   từ thời điểm gọi trở đi (không phải cả ngày) — giờ chỉ dùng làm gợi ý cho ngày bay admin chọn.
 *
 * @param {Array} rows - payload.response của AirLabs
 * @returns {Array<{ flight_iata: string, airline_iata: string|null, dep_vn: string, arr_vn: string }>}
 */
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

// Gắn vào globalThis vì Next.js có thể nạp module này nhiều lần (dev/HMR). Chỉ lưu kết quả THÀNH CÔNG.
function store() {
  if (!globalThis.__airlabsScheduleCache) globalThis.__airlabsScheduleCache = new Map();
  return globalThis.__airlabsScheduleCache;
}

/** @returns {Array|null} lịch bay đã lưu của tuyến (null nếu chưa có hoặc đã hết hạn) */
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
