const MAX_SEATS_PER_ROW = 10; // A..J
const MAX_ROWS_PER_CLASS = 60;
const MAX_TOTAL_SEATS = 600;

function seatLetters(count) {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function normalizeLayout(cfg) {
  const c = cfg ?? {};
  return {
    businessRows: toInt(c.businessRows),
    businessPerRow: toInt(c.businessPerRow),
    economyRows: toInt(c.economyRows),
    economyPerRow: toInt(c.economyPerRow),
  };
}

function layoutTotal(cfg) {
  const l = normalizeLayout(cfg);
  return Math.max(l.businessRows, 0) * Math.max(l.businessPerRow, 0) +
    Math.max(l.economyRows, 0) * Math.max(l.economyPerRow, 0);
}

/** Trả về chuỗi lỗi (tiếng Việt) hoặc null nếu cấu hình hợp lệ. */
function validateLayout(cfg) {
  const l = normalizeLayout(cfg);
  for (const [label, rows, perRow] of [
    ["business", l.businessRows, l.businessPerRow],
    ["economy", l.economyRows, l.economyPerRow],
  ]) {
    if (rows < 0 || perRow < 0) return `Số hàng / số ghế mỗi hàng của hạng ${label} không được âm.`;
    if (rows > MAX_ROWS_PER_CLASS) return `Hạng ${label}: tối đa ${MAX_ROWS_PER_CLASS} hàng.`;
    if (perRow > MAX_SEATS_PER_ROW) return `Hạng ${label}: tối đa ${MAX_SEATS_PER_ROW} ghế mỗi hàng.`;
    if ((rows > 0) !== (perRow > 0)) {
      return `Hạng ${label}: phải nhập cả số hàng và số ghế mỗi hàng (hoặc để cả hai bằng 0 nếu không có hạng này).`;
    }
  }
  const total = layoutTotal(l);
  if (total === 0) return "Cần ít nhất 1 ghế (business hoặc economy).";
  if (total > MAX_TOTAL_SEATS) return `Tổng số ghế tối đa ${MAX_TOTAL_SEATS}.`;
  return null;
}

function buildSeatMap(cfg) {
  const l = normalizeLayout(cfg);
  const seatMap = [];
  const bRows = Math.max(l.businessRows, 0);
  const eRows = Math.max(l.economyRows, 0);
  const bCols = seatLetters(Math.max(l.businessPerRow, 0));
  const eCols = seatLetters(Math.max(l.economyPerRow, 0));
  for (let row = 1; row <= bRows; row++) {
    for (const col of bCols) seatMap.push({ seat_number: `${row}${col}`, seat_class: "business" });
  }
  for (let row = bRows + 1; row <= bRows + eRows; row++) {
    for (const col of eCols) seatMap.push({ seat_number: `${row}${col}`, seat_class: "economy" });
  }
  return seatMap;
}

/** Suy ngược cấu hình từ template đã lưu. */
function detectLayout(template) {
  const seats = Array.isArray(template) ? template : [];
  const stat = (cls) => {
    const rows = new Map();
    for (const s of seats) {
      if (s.seat_class !== cls) continue;
      const m = /^(\d+)([A-Za-z]+)$/.exec(String(s.seat_number));
      if (!m) continue;
      rows.set(m[1], (rows.get(m[1]) ?? 0) + 1);
    }
    return { rows: rows.size, perRow: rows.size ? Math.max(...rows.values()) : 0 };
  };
  const b = stat("business");
  const e = stat("economy");
  const layout = {
    businessRows: b.rows, businessPerRow: b.perRow,
    economyRows: e.rows, economyPerRow: e.perRow,
  };
  const rebuilt = buildSeatMap(layout);
  const key = (s) => `${s.seat_number}|${s.seat_class}`;
  const have = new Set(seats.map(key));
  const standard =
    rebuilt.length === seats.length &&
    have.size === seats.length &&
    rebuilt.every((s) => have.has(key(s))) &&
    b.perRow <= MAX_SEATS_PER_ROW && e.perRow <= MAX_SEATS_PER_ROW;
  return { ...layout, standard };
}

module.exports = {
  MAX_SEATS_PER_ROW, MAX_ROWS_PER_CLASS, MAX_TOTAL_SEATS,
  seatLetters, normalizeLayout, layoutTotal, validateLayout, buildSeatMap, detectLayout,
};
