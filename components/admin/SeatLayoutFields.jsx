"use client";

// components/admin/SeatLayoutFields.jsx
//
// Ô nhập cấu hình ghế THEO HẠNG (số hàng + số ghế mỗi hàng của business / economy) kèm
// xem trước sơ đồ cabin. Dùng chung cho form thêm máy bay và dòng sửa máy bay (A2) để hai nơi
// luôn sinh ghế giống nhau. State do component cha giữ (controlled).

import { MAX_ROWS_PER_CLASS, MAX_SEATS_PER_ROW, layoutTotal, seatLetters } from "@/lib/seatLayout";

const inputCls =
  "w-24 rounded-lg border border-sand-100 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500";

function NumberField({ label, value, onChange, max }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function ClassBox({ title, rows, perRow, onRows, onPerRow }) {
  return (
    <fieldset className="rounded-lg border border-sand-100 bg-sand-50/60 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sea-700">{title}</legend>
      <div className="flex flex-wrap gap-3">
        <NumberField label="Số hàng" value={rows} onChange={onRows} max={MAX_ROWS_PER_CLASS} />
        <NumberField label="Ghế mỗi hàng" value={perRow} onChange={onPerRow} max={MAX_SEATS_PER_ROW} />
      </div>
    </fieldset>
  );
}

/** layout = { businessRows, businessPerRow, economyRows, economyPerRow } (giá trị có thể là chuỗi). */
export default function SeatLayoutFields({ layout, onChange }) {
  const set = (key) => (v) => onChange({ ...layout, [key]: v });
  const total = layoutTotal(layout);
  const bSeats = (Number(layout.businessRows) || 0) * (Number(layout.businessPerRow) || 0);
  const eSeats = (Number(layout.economyRows) || 0) * (Number(layout.economyPerRow) || 0);
  const bRows = Number(layout.businessRows) || 0;
  const eRows = Number(layout.economyRows) || 0;
  const bLetters = seatLetters(Number(layout.businessPerRow) || 0);
  const eLetters = seatLetters(Number(layout.economyPerRow) || 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <ClassBox
          title="Hạng Business"
          rows={layout.businessRows}
          perRow={layout.businessPerRow}
          onRows={set("businessRows")}
          onPerRow={set("businessPerRow")}
        />
        <ClassBox
          title="Hạng Economy"
          rows={layout.economyRows}
          perRow={layout.economyPerRow}
          onRows={set("economyRows")}
          onPerRow={set("economyPerRow")}
        />
      </div>
      <p className="text-xs text-ink/60">
        {bSeats} ghế business{bRows > 0 && ` (hàng 1–${bRows}, cột ${bLetters[0]}–${bLetters[bLetters.length - 1]})`} +{" "}
        {eSeats} ghế economy
        {eRows > 0 && ` (hàng ${bRows + 1}–${bRows + eRows}, cột ${eLetters[0]}–${eLetters[eLetters.length - 1]})`} ={" "}
        <strong className="text-sea-900">{total} ghế tổng</strong>
      </p>
    </div>
  );
}
