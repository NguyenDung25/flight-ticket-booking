// tests/airlabsSchedules.test.js — A1: xử lý kết quả AirLabs /schedules cho nút tự điền lịch bay
// (bỏ codeshare, không cắt bớt, đổi giờ VN) và bộ nhớ đệm theo tuyến. Không gọi mạng.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CACHE_TTL_MS,
  toVNInput,
  normalizeSchedules,
  getCachedSchedules,
  setCachedSchedules,
} = require("../lib/airlabsSchedules");

const row = (flight, depUtc, arrUtc, extra = {}) => ({
  flight_iata: flight,
  airline_iata: flight.slice(0, 2),
  dep_time_utc: depUtc,
  arr_time_utc: arrUtc,
  ...extra,
});

test("toVNInput: giờ UTC của AirLabs -> giờ VN dạng datetime-local", () => {
  assert.equal(toVNInput("2026-10-15 05:25"), "2026-10-15T12:25");
  assert.equal(toVNInput("2026-10-15 20:00"), "2026-10-16T03:00"); // qua ngày theo giờ VN
  assert.equal(toVNInput("rác"), null);
  assert.equal(toVNInput(undefined), null);
});

test("normalizeSchedules: bỏ chuyến codeshare, giữ chuyến khai thác thật", () => {
  const out = normalizeSchedules([
    row("VN213", "2026-10-15 06:40", "2026-10-15 08:50"),
    row("CI8813", "2026-10-15 06:40", "2026-10-15 08:50", { cs_flight_iata: "VN213", cs_airline_iata: "VN" }),
    row("K63215", "2026-10-15 07:00", "2026-10-15 09:10", { cs_flight_iata: "VN215" }),
  ]);
  assert.deepEqual(out.map((s) => s.flight_iata), ["VN213"]);
  assert.deepEqual(out[0], { flight_iata: "VN213", airline_iata: "VN", dep_vn: "2026-10-15T13:40", arr_vn: "2026-10-15T15:50" });
});

test("normalizeSchedules: KHÔNG cắt bớt (trước đây chỉ 30), bỏ trùng, sắp theo giờ VN", () => {
  const rows = [];
  for (let i = 0; i < 45; i++) {
    const h = String(Math.floor(i / 2)).padStart(2, "0");
    const m = i % 2 ? "30" : "00";
    rows.push(row(`VJ${100 + i}`, `2026-10-15 ${h}:${m}`, `2026-10-15 ${h}:${m}`));
  }
  rows.push(row("VJ100", "2026-10-15 00:00", "2026-10-15 02:00")); // trùng số hiệu + giờ
  rows.reverse();
  const out = normalizeSchedules(rows);
  assert.equal(out.length, 45);
  const times = out.map((s) => s.dep_vn.slice(11));
  assert.deepEqual(times, [...times].sort());
});

test("normalizeSchedules: dữ liệu thiếu/sai bị bỏ qua, đầu vào lạ không làm văng lỗi", () => {
  assert.deepEqual(normalizeSchedules(undefined), []);
  assert.deepEqual(normalizeSchedules({ error: "x" }), []);
  assert.deepEqual(normalizeSchedules([null, { flight_iata: "VN1" }, row("VN2", "sai", "2026-10-15 08:00")]), []);
});

test("cache theo tuyến: trả kết quả đã lưu trong thời hạn, hết hạn thì bỏ", () => {
  const t0 = 1_000_000;
  const data = [{ flight_iata: "VN213" }];
  setCachedSchedules("HAN", "SGN", data, t0);
  assert.equal(getCachedSchedules("HAN", "SGN", t0 + 1000), data);
  assert.equal(getCachedSchedules("SGN", "HAN", t0 + 1000), null); // chiều ngược là tuyến khác
  assert.equal(getCachedSchedules("HAN", "SGN", t0 + CACHE_TTL_MS + 1), null);
  assert.equal(getCachedSchedules("HAN", "SGN", t0 + 1000), null); // đã xóa khi hết hạn
});
