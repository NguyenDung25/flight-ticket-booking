"use client";

// app/admin/aircraft/AircraftForm.jsx
//
// A2 — thay vì bắt admin tự gõ tay từng ghế trong seat_map_template (dễ sai,
// dễ lệch total_seats — đúng cảnh báo trong models/Aircraft.js), form này tự
// SINH seat_map_template từ 2 số admin nhập: số hàng business + số hàng
// economy. Business luôn đánh số hàng TRƯỚC (1..businessRows, 4 cột A-D),
// economy đánh số SAU (businessRows+1..cuối, 6 cột A-F) — ĐÚNG y hệt công
// thức scripts/seedSample.js:seedAircraft() đang dùng để nhất quán trong
// toàn dự án, không tự nghĩ ra layout khác.
//
// Preview trước khi lưu — admin thấy ngay tổng ghế tính ra trước khi bấm
// tạo, không phải đoán.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const BUSINESS_COLS = ["A", "B", "C", "D"];
const ECONOMY_COLS = ["A", "B", "C", "D", "E", "F"];

function buildSeatMap(businessRows, economyRows) {
  const seatMap = [];
  for (let row = 1; row <= businessRows; row++) {
    for (const col of BUSINESS_COLS) {
      seatMap.push({ seat_number: `${row}${col}`, seat_class: "business" });
    }
  }
  for (let row = businessRows + 1; row <= businessRows + economyRows; row++) {
    for (const col of ECONOMY_COLS) {
      seatMap.push({ seat_number: `${row}${col}`, seat_class: "economy" });
    }
  }
  return seatMap;
}

export default function AircraftForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [businessRows, setBusinessRows] = useState(0);
  const [economyRows, setEconomyRows] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const seatMap = useMemo(
    () => buildSeatMap(Number(businessRows) || 0, Number(economyRows) || 0),
    [businessRows, economyRows]
  );
  const businessSeatCount = (Number(businessRows) || 0) * BUSINESS_COLS.length;
  const economySeatCount = (Number(economyRows) || 0) * ECONOMY_COLS.length;
  const totalSeats = businessSeatCount + economySeatCount;

  async function handleSubmit(e) {
    e.preventDefault();
    if (totalSeats === 0) {
      setError("Cần ít nhất 1 hàng ghế (business hoặc economy).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/aircraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          total_seats: totalSeats,
          seat_map_template: seatMap,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Có lỗi xảy ra.");
      }
      setName("");
      setBusinessRows(0);
      setEconomyRows(0);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-sand-100 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Tên máy bay</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="VD: Airbus A321"
            className="w-56 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Số hàng business (4 ghế/hàng)</label>
          <input
            type="number"
            min={0}
            value={businessRows}
            onChange={(e) => setBusinessRows(e.target.value)}
            className="w-40 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Số hàng economy (6 ghế/hàng)</label>
          <input
            type="number"
            min={0}
            value={economyRows}
            onChange={(e) => setEconomyRows(e.target.value)}
            className="w-40 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
        >
          {pending ? "Đang thêm..." : "Thêm máy bay"}
        </button>
      </div>

      <p className="mt-3 text-xs text-ink/60">
        Preview: {businessSeatCount} ghế business (hàng 1–{businessRows || 0}) +{" "}
        {economySeatCount} ghế economy (hàng {Number(businessRows) + 1}–
        {Number(businessRows) + Number(economyRows)}) = <strong>{totalSeats} ghế tổng</strong>
      </p>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </form>
  );
}
