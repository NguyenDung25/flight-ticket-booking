// Chuẩn hóa dữ liệu trang Tổng quan admin theo THÁNG (không cần MongoDB).
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatMonthLabel, formatMonthTitle, shiftMonth, resolveMonth, monthRevenue, buildMonthWindow, monthOptions,
  toRouteChartData, MAX_MONTHS, MAX_ROUTES,
} = require("../lib/adminChartData");

test("formatMonthLabel / formatMonthTitle: bỏ số 0 đầu", () => {
  assert.equal(formatMonthLabel("2026-10"), "Th10/2026");
  assert.equal(formatMonthLabel("2026-03"), "Th3/2026");
  assert.equal(formatMonthTitle("2026-03"), "3/2026");
});

test("shiftMonth: lùi/tiến qua ranh giới năm, không phụ thuộc múi giờ", () => {
  assert.equal(shiftMonth("2026-10", -1), "2026-09");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(shiftMonth("2026-10", -11), "2025-11");
  assert.equal(shiftMonth("2026-10", 0), "2026-10");
  assert.throws(() => shiftMonth("2026-13", 1));
});

test("resolveMonth: tháng hợp lệ và không ở tương lai thì giữ; sai/thiếu/tương lai -> tháng hiện tại", () => {
  assert.equal(resolveMonth("2026-08", "2026-10"), "2026-08");
  assert.equal(resolveMonth("2026-10", "2026-10"), "2026-10");
  for (const bad of ["2026-11", "2027-01", "2026-13", "2026-1", "abc", "", undefined, null, ["2026-08"], "2026-08-01"]) {
    assert.equal(resolveMonth(bad, "2026-10"), "2026-10", String(bad));
  }
});

const data = [
  { month: "2026-08", confirmed_revenue: 600, penalty_revenue: 30, total_revenue: 630 },
  { month: "2026-09", confirmed_revenue: 500, penalty_revenue: 20, total_revenue: 520 },
  { month: "2026-10", confirmed_revenue: 700, penalty_revenue: 10, total_revenue: 710 },
];

test("monthRevenue: lấy đúng tháng; tháng không có dữ liệu = 0", () => {
  assert.deepEqual(monthRevenue(data, "2026-09"), { confirmed_revenue: 500, penalty_revenue: 20, total_revenue: 520 });
  assert.deepEqual(monthRevenue(data, "2026-07"), { confirmed_revenue: 0, penalty_revenue: 0, total_revenue: 0 });
  assert.deepEqual(monthRevenue(undefined, "2026-07"), { confirmed_revenue: 0, penalty_revenue: 0, total_revenue: 0 });
});

test("buildMonthWindow: 12 tháng LIỀN NHAU kết thúc ở tháng đang chọn, tháng trống = 0, đánh dấu tháng chọn", () => {
  const w = buildMonthWindow(data, "2026-10");
  assert.equal(w.length, MAX_MONTHS);
  assert.equal(w[0].month, "2025-11");
  assert.equal(w[11].month, "2026-10");
  assert.deepEqual(w[11], { month: "2026-10", label: "Th10/2026", ticket: 700, penalty: 10, selected: true });
  assert.deepEqual(w[0], { month: "2025-11", label: "Th11/2025", ticket: 0, penalty: 0, selected: false });
  assert.equal(w.filter((x) => x.selected).length, 1);
});

test("buildMonthWindow: chọn tháng cũ thì cửa sổ lùi theo, vẫn kết thúc ở tháng đó", () => {
  const w = buildMonthWindow(data, "2026-08");
  assert.equal(w[11].month, "2026-08");
  assert.equal(w[11].ticket, 600);
  assert.equal(w[0].month, "2025-09");
  assert.deepEqual(buildMonthWindow([], "2026-08").map((x) => x.ticket), new Array(12).fill(0));
});

test("monthOptions: tháng có dữ liệu + tháng hiện tại, mới nhất trước, bỏ tương lai, không trùng", () => {
  const opts = monthOptions([...data, { month: "2026-11", total_revenue: 1 }, { month: "2026-10", total_revenue: 1 }], "2026-10");
  assert.deepEqual(opts.map((o) => o.value), ["2026-10", "2026-09", "2026-08"]);
  assert.equal(opts[0].label, "Tháng 10/2026");
  assert.deepEqual(monthOptions([], "2026-10").map((o) => o.value), ["2026-10"]); // chưa có dữ liệu vẫn có tháng hiện tại
});

test("toRouteChartData: nhãn 'HAN → SGN', giữ thứ tự xếp hạng, chỉ lấy 8 tuyến đầu", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ origin: "HAN", dest: `D${i}`, total_revenue: 1000 - i }));
  const out = toRouteChartData(rows);
  assert.equal(out.length, MAX_ROUTES);
  assert.deepEqual(out[0], { label: "HAN → D0", total: 1000 });
  assert.deepEqual(toRouteChartData(null), []);
});
