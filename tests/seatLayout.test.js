// Cấu hình ghế máy bay theo hạng (không cần MongoDB).
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSeatMap, detectLayout, validateLayout, layoutTotal, seatLetters, MAX_SEATS_PER_ROW, MAX_TOTAL_SEATS,
} = require("../lib/seatLayout");
const { assertValidSeatMapTemplate } = require("../lib/seatMapValidation");

test("buildSeatMap: layout cũ 4/6 cột vẫn ra đúng sơ đồ seedSample (2 hàng business, 8 hàng economy)", () => {
  const m = buildSeatMap({ businessRows: 2, businessPerRow: 4, economyRows: 8, economyPerRow: 6 });
  assert.equal(m.length, 56);
  assert.equal(m[0].seat_number, "1A");
  assert.equal(m[7].seat_number, "2D");
  assert.equal(m[8].seat_number, "3A");
  assert.equal(m[8].seat_class, "economy");
  assert.equal(m.at(-1).seat_number, "10F");
});

test("buildSeatMap: số ghế mỗi hàng tùy hạng (business 2, economy 3)", () => {
  const m = buildSeatMap({ businessRows: 3, businessPerRow: 2, economyRows: 2, economyPerRow: 3 });
  assert.deepEqual(m.filter((s) => s.seat_class === "business").map((s) => s.seat_number), ["1A", "1B", "2A", "2B", "3A", "3B"]);
  assert.deepEqual(m.filter((s) => s.seat_class === "economy").map((s) => s.seat_number), ["4A", "4B", "4C", "5A", "5B", "5C"]);
  assert.equal(layoutTotal({ businessRows: 3, businessPerRow: 2, economyRows: 2, economyPerRow: 3 }), m.length);
  assert.doesNotThrow(() => assertValidSeatMapTemplate(m));
});

test("buildSeatMap: chỉ có 1 hạng; chuỗi số từ input được ép số", () => {
  const m = buildSeatMap({ businessRows: "0", businessPerRow: "0", economyRows: "2", economyPerRow: "10" });
  assert.equal(m.length, 20);
  assert.equal(m[0].seat_number, "1A");
  assert.equal(m[9].seat_number, "1J");
  assert.equal(seatLetters(3).join(""), "ABC");
});

test("validateLayout: chặn cấu hình sai", () => {
  const ok = { businessRows: 2, businessPerRow: 4, economyRows: 5, economyPerRow: 6 };
  assert.equal(validateLayout(ok), null);
  assert.match(validateLayout({ businessRows: 0, businessPerRow: 0, economyRows: 0, economyPerRow: 0 }), /ít nhất 1 ghế/);
  assert.match(validateLayout({ ...ok, businessPerRow: 0 }), /cả số hàng và số ghế/);
  assert.match(validateLayout({ ...ok, economyRows: 0 }), /cả số hàng và số ghế/);
  assert.match(validateLayout({ ...ok, economyPerRow: MAX_SEATS_PER_ROW + 1 }), /tối đa/);
  assert.match(validateLayout({ ...ok, businessRows: -1 }), /không được âm/);
  assert.match(validateLayout({ businessRows: 31, businessPerRow: 10, economyRows: 30, economyPerRow: 10 }), new RegExp(String(MAX_TOTAL_SEATS)));
});

test("detectLayout: nhận lại đúng cấu hình đã sinh; sơ đồ tùy chỉnh bị đánh dấu standard=false", () => {
  const cfg = { businessRows: 2, businessPerRow: 3, economyRows: 4, economyPerRow: 5 };
  const d = detectLayout(buildSeatMap(cfg));
  assert.deepEqual({ ...d, standard: undefined }, { ...cfg, standard: undefined });
  assert.equal(d.standard, true);

  const custom = buildSeatMap(cfg).filter((s) => s.seat_number !== "4C"); // thiếu 1 ghế
  assert.equal(detectLayout(custom).standard, false);
  assert.equal(detectLayout([]).standard, true);
});

test("seatMapValidation: chặn template quá lớn", () => {
  const big = Array.from({ length: MAX_TOTAL_SEATS + 1 }, (_, i) => ({ seat_number: `${i + 1}A`.slice(0, 8), seat_class: "economy" }));
  assert.throws(() => assertValidSeatMapTemplate(big), /tối đa/);
});
