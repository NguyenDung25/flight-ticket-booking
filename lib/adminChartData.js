const MAX_MONTHS = 12; // biểu đồ theo tháng vẽ 12 tháng liền nhau cho dễ đọc
const MAX_ROUTES = 8; // chỉ xếp hạng 8 tuyến cao nhất của tháng

const YM = /^(\d{4})-(0[1-9]|1[0-2])$/;

// "2026-10" -> "Th10/2026"
function formatMonthLabel(ym) {
  const [year, month] = String(ym).split("-");
  return `Th${Number(month)}/${year}`;
}

// "2026-10" -> "10/2026" (dùng trong tiêu đề: "Doanh thu tháng 10/2026")
function formatMonthTitle(ym) {
  const [year, month] = String(ym).split("-");
  return `${Number(month)}/${year}`;
}

/** Dịch tháng "YYYY-MM" đi `delta` tháng (âm = lùi). Tính số học thuần, không phụ thuộc múi giờ máy. */
function shiftMonth(ym, delta) {
  const m = YM.exec(ym);
  if (!m) throw new Error(`Tháng không hợp lệ: ${ym}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Tháng đang xem: giá trị ?month= nếu hợp lệ và không ở tương lai, ngược lại là tháng hiện tại. */
function resolveMonth(param, currentYm) {
  return typeof param === "string" && YM.test(param) && param <= currentYm ? param : currentYm;
}

/** Doanh thu của 1 tháng trong danh sách getRevenueByMonth (không có dữ liệu = 0). */
function monthRevenue(byMonth, ym) {
  const row = (byMonth || []).find((m) => m.month === ym);
  return {
    confirmed_revenue: row?.confirmed_revenue ?? 0,
    penalty_revenue: row?.penalty_revenue ?? 0,
    total_revenue: row?.total_revenue ?? 0,
  };
}

/** 12 tháng liền nhau kết thúc ở `selectedYm` (tháng không có doanh thu = 0 để trục đều). */
function buildMonthWindow(byMonth, selectedYm, count = MAX_MONTHS) {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(selectedYm, i - (count - 1));
    const r = monthRevenue(byMonth, month);
    return {
      month,
      label: formatMonthLabel(month),
      ticket: r.confirmed_revenue,
      penalty: r.penalty_revenue,
      selected: month === selectedYm,
    };
  });
}

/** Các tháng cho ô chọn: mọi tháng có doanh thu + tháng hiện tại, mới nhất trước, không có tháng tương lai. */
function monthOptions(byMonth, currentYm) {
  const set = new Set([currentYm, ...(byMonth || []).map((m) => m.month)]);
  return [...set]
    .filter((m) => YM.test(m) && m <= currentYm)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: `Tháng ${formatMonthTitle(value)}` }));
}

/** @param {Array<{origin:string, dest:string, total_revenue:number}>} byRoute (đã sắp giảm dần theo doanh thu) */
function toRouteChartData(byRoute) {
  return (byRoute || []).slice(0, MAX_ROUTES).map((r) => ({
    label: `${r.origin} → ${r.dest}`,
    total: r.total_revenue,
  }));
}

module.exports = {
  MAX_MONTHS,
  MAX_ROUTES,
  formatMonthLabel,
  formatMonthTitle,
  shiftMonth,
  resolveMonth,
  monthRevenue,
  buildMonthWindow,
  monthOptions,
  toRouteChartData,
};
