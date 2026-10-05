"use client";

// app/admin/aircraft/AircraftRow.jsx
//
// A2 — 1 dòng máy bay, có sửa tại chỗ + xóa. Sơ đồ ghế sinh theo CÙNG công thức
// với AircraftForm.jsx (business 4 ghế/hàng đánh số trước, economy 6 ghế/hàng sau).
// Chỉ gửi seat_map_template khi admin THỰC SỰ đổi số hàng — nếu chỉ đổi tên thì
// giữ nguyên sơ đồ ghế cũ (kể cả sơ đồ nhập tay không theo layout chuẩn).
//
// Lưu ý hiển thị cho admin: sửa sơ đồ KHÔNG đổi ghế của chuyến bay đã tạo (ghi chú u).

import { useState } from "react";
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

const inputCls =
  "rounded-lg border border-sand-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500";

export default function AircraftRow({ aircraft }) {
  const router = useRouter();
  const initialBusinessRows = Math.round(aircraft.businessCount / BUSINESS_COLS.length);
  const initialEconomyRows = Math.round(aircraft.economyCount / ECONOMY_COLS.length);

  const [mode, setMode] = useState("view"); // view | edit | confirmDelete
  const [name, setName] = useState(aircraft.name);
  const [businessRows, setBusinessRows] = useState(initialBusinessRows);
  const [economyRows, setEconomyRows] = useState(initialEconomyRows);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setMode("view");
    setError(null);
    setName(aircraft.name);
    setBusinessRows(initialBusinessRows);
    setEconomyRows(initialEconomyRows);
  }

  async function call(options) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/aircraft/${aircraft.id}`, options);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      setMode("view");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    const b = Number(businessRows) || 0;
    const e = Number(economyRows) || 0;
    const rowsChanged = b !== initialBusinessRows || e !== initialEconomyRows;
    if (rowsChanged && b + e === 0) {
      setError("Cần ít nhất 1 hàng ghế.");
      return;
    }
    const payload = { name: name.trim() };
    if (rowsChanged) {
      const seatMap = buildSeatMap(b, e);
      payload.seat_map_template = seatMap;
      payload.total_seats = seatMap.length;
    }
    call({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  if (mode === "edit") {
    const previewTotal =
      (Number(businessRows) || 0) * BUSINESS_COLS.length +
      (Number(economyRows) || 0) * ECONOMY_COLS.length;
    return (
      <tr className="border-b border-sand-100 bg-sand-50/50 last:border-0 align-top">
        <td className="px-4 py-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputCls} w-full min-w-[160px]`}
          />
        </td>
        <td className="px-4 py-3 text-ink/70">{previewTotal}</td>
        <td className="px-4 py-3">
          <input
            type="number"
            min={0}
            value={businessRows}
            onChange={(e) => setBusinessRows(e.target.value)}
            className={`${inputCls} w-20`}
            title="Số hàng business (4 ghế/hàng)"
          />
          <div className="mt-1 text-[11px] text-ink/50">hàng</div>
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            min={0}
            value={economyRows}
            onChange={(e) => setEconomyRows(e.target.value)}
            className={`${inputCls} w-20`}
            title="Số hàng economy (6 ghế/hàng)"
          />
          <div className="mt-1 text-[11px] text-ink/50">hàng</div>
        </td>
        <td className="px-4 py-3">
          <div className="flex w-56 flex-col gap-2">
            <p className="text-[11px] text-ink/60">
              Sửa sơ đồ ghế chỉ áp dụng cho chuyến bay tạo SAU, không đổi chuyến đã có.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="rounded-lg bg-sea-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {pending ? "Đang lưu..." : "Lưu"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="rounded-lg bg-sand-100 px-3 py-1 text-xs font-medium text-ink"
              >
                Bỏ qua
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-sand-100 last:border-0">
      <td className="px-4 py-3 font-medium text-ink">{aircraft.name}</td>
      <td className="px-4 py-3 text-ink/70">{aircraft.total_seats}</td>
      <td className="px-4 py-3 text-ink/70">{aircraft.businessCount}</td>
      <td className="px-4 py-3 text-ink/70">{aircraft.economyCount}</td>
      <td className="px-4 py-3">
        {mode === "confirmDelete" ? (
          <div className="flex w-52 flex-col gap-2">
            <p className="text-xs font-medium text-danger">Xóa loại máy bay này — không thể hoàn tác.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => call({ method: "DELETE" })}
                disabled={pending}
                className="flex-1 rounded-lg bg-danger px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {pending ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="rounded-lg bg-sand-100 px-2 py-1 text-xs font-medium text-ink"
              >
                Bỏ qua
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {aircraft.mismatch && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                Lệch tổng ghế!
              </span>
            )}
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="rounded-lg border border-sea-700 px-3 py-1 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
            >
              Sửa
            </button>
            <button
              type="button"
              onClick={() => setMode("confirmDelete")}
              className="rounded-lg border border-danger px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white"
            >
              Xóa
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
