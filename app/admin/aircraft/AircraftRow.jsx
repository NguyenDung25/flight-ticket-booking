"use client";

// app/admin/aircraft/AircraftRow.jsx
//
// A2 — 1 dòng máy bay, có sửa tại chỗ + xóa. "Sửa" mở hàng phụ ngay dưới dòng để đổi tên và CẤU HÌNH
// GHẾ THEO HẠNG (số hàng + số ghế mỗi hàng của business / economy), sinh bằng lib/seatLayout.js
// (cùng công thức với AircraftForm). Chỉ gửi seat_map_template khi admin THỰC SỰ đổi cấu hình ghế —
// nếu chỉ đổi tên thì giữ nguyên sơ đồ cũ (kể cả sơ đồ nhập tay không theo layout chuẩn).
//
// Lưu ý hiển thị cho admin: sửa sơ đồ KHÔNG đổi ghế của chuyến bay đã tạo (ghi chú u).

import { useState } from "react";
import { useRouter } from "next/navigation";
import SeatLayoutFields from "@/components/admin/SeatLayoutFields";
import { buildSeatMap, validateLayout } from "@/lib/seatLayout";

const inputCls =
  "rounded-lg border border-sand-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500";

function describe(rows, perRow) {
  return rows > 0 ? `${rows} hàng × ${perRow} ghế` : "—";
}

export default function AircraftRow({ aircraft }) {
  const router = useRouter();
  const { layout: initialLayout } = aircraft; // { businessRows, businessPerRow, economyRows, economyPerRow, standard }

  const [mode, setMode] = useState("view"); // view | edit | confirmDelete
  const [name, setName] = useState(aircraft.name);
  const [layout, setLayout] = useState({
    businessRows: initialLayout.businessRows,
    businessPerRow: initialLayout.businessPerRow,
    economyRows: initialLayout.economyRows,
    economyPerRow: initialLayout.economyPerRow,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setMode("view");
    setError(null);
    setName(aircraft.name);
    setLayout({
      businessRows: initialLayout.businessRows,
      businessPerRow: initialLayout.businessPerRow,
      economyRows: initialLayout.economyRows,
      economyPerRow: initialLayout.economyPerRow,
    });
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
    const layoutChanged = ["businessRows", "businessPerRow", "economyRows", "economyPerRow"].some(
      (k) => (Number(layout[k]) || 0) !== initialLayout[k]
    );
    const payload = { name: name.trim() };
    if (layoutChanged) {
      const layoutError = validateLayout(layout);
      if (layoutError) {
        setError(layoutError);
        return;
      }
      const seatMap = buildSeatMap(layout);
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
    return (
      <tr className="border-b border-sand-100 bg-sand-50/70 last:border-0">
        <td colSpan={5} className="px-4 py-4">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink/60">Tên máy bay</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-64`} />
            </label>

            {!initialLayout.standard && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                Sơ đồ ghế hiện tại là sơ đồ tùy chỉnh (không đều theo hàng). Nếu bạn đổi cấu hình bên dưới,
                toàn bộ sơ đồ sẽ được sinh lại theo cấu hình mới; chỉ đổi tên thì sơ đồ giữ nguyên.
              </p>
            )}

            <SeatLayoutFields layout={layout} onChange={setLayout} />

            <p className="text-[11px] text-ink/60">
              Sửa sơ đồ ghế chỉ áp dụng cho chuyến bay tạo SAU, không đổi chuyến đã có.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
              >
                {pending ? "Đang lưu..." : "Lưu"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="rounded-lg bg-sand-100 px-4 py-1.5 text-sm font-medium text-ink"
              >
                Bỏ qua
              </button>
              {error && <p className="text-xs text-danger">{error}</p>}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-sand-100 last:border-0">
      <td className="px-4 py-3 font-medium text-ink">{aircraft.name}</td>
      <td className="px-4 py-3 text-ink/70">{aircraft.total_seats}</td>
      <td className="px-4 py-3 text-ink/70">
        {aircraft.businessCount}
        <div className="text-[11px] text-ink/50">
          {initialLayout.standard ? describe(initialLayout.businessRows, initialLayout.businessPerRow) : "tùy chỉnh"}
        </div>
      </td>
      <td className="px-4 py-3 text-ink/70">
        {aircraft.economyCount}
        <div className="text-[11px] text-ink/50">
          {initialLayout.standard ? describe(initialLayout.economyRows, initialLayout.economyPerRow) : "tùy chỉnh"}
        </div>
      </td>
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
              className="whitespace-nowrap rounded-lg border border-sea-700 px-3 py-1 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
            >
              Sửa cấu hình
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
