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
  dep_iata: "SGN",
  arr_iata: "HAN",
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
  assert.deepEqual(out[0], {
    flight_iata: "VN213",
    airline_iata: "VN",
    dep_iata: "SGN",
    arr_iata: "HAN",
    dep_vn: "2026-10-15T13:40",
    arr_vn: "2026-10-15T15:50",
  });
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

const { normalizeAircraftCode, matchAircraft, aircraftLabel, getCachedAircraft, setCachedAircraft } = require("../lib/airlabsSchedules");

test("normalizeAircraftCode: chỉ nhận mã ICAO 2–4 ký tự", () => {
  assert.equal(normalizeAircraftCode(" a21n "), "A21N");
  assert.equal(normalizeAircraftCode(""), null);
  assert.equal(normalizeAircraftCode("A321-200"), null);
  assert.equal(normalizeAircraftCode(null), null);
});

test("matchAircraft: ưu tiên biến thể cụ thể, sau đó dòng chung", () => {
  const list = [
    { id: "1", name: "Airbus A321 (Demo)" },
    { id: "2", name: "Airbus A321neo" },
    { id: "3", name: "Boeing 787-9 Dreamliner" },
  ];
  assert.equal(matchAircraft("A21N", list).id, "2");
  assert.equal(matchAircraft("A321", list).id, "1");
  assert.equal(matchAircraft("B789", list).id, "3");
  assert.equal(matchAircraft("B78X", list).id, "3"); // không có 787-10 -> rơi về dòng 787
  assert.equal(matchAircraft("A359", list), null);
  assert.equal(matchAircraft(null, list), null);
  assert.equal(matchAircraft("A20N", [{ id: "9", name: "A320" }]).id, "9");
});

test("aircraftLabel: mã ICAO -> tên dòng máy bay", () => {
  assert.equal(aircraftLabel("A21N"), "A321neo");
  assert.equal(aircraftLabel("ZZZ1"), "ZZZ1");
  assert.equal(aircraftLabel(""), null);
});

test("cache loại máy bay: lưu cả kết quả null, hết hạn sau CACHE_TTL_MS", () => {
  setCachedAircraft("XX1", null, 1000);
  assert.equal(getCachedAircraft("XX1", 1000 + 10), null);
  assert.equal(getCachedAircraft("XX1", 1000 + CACHE_TTL_MS + 1), undefined);
  assert.equal(getCachedAircraft("YY2"), undefined);
});

test("normalizeSchedules: tra theo 1 sân bay -> chỉ giữ chuyến có cả 2 đầu thuộc hệ thống", () => {
  const airports = new Set(["SGN", "HAN", "DAD"]);
  const out = normalizeSchedules(
    [
      row("VN213", "2026-10-15 06:40", "2026-10-15 08:50"),
      row("VN120", "2026-10-15 06:40", "2026-10-15 08:00", { arr_iata: "DAD" }),
      row("VN300", "2026-10-15 07:00", "2026-10-15 13:00", { arr_iata: "NRT" }),
    ],
    airports
  );
  assert.deepEqual(out.map((s) => `${s.flight_iata} ${s.arr_iata}`), ["VN213 HAN", "VN120 DAD"]);
});
