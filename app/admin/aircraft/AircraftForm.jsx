"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SeatLayoutFields from "@/components/admin/SeatLayoutFields";
import { buildSeatMap, validateLayout } from "@/lib/seatLayout";

const EMPTY_LAYOUT = { businessRows: 0, businessPerRow: 0, economyRows: 0, economyPerRow: 0 };

export default function AircraftForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [layout, setLayout] = useState(EMPTY_LAYOUT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const seatMap = useMemo(() => buildSeatMap(layout), [layout]);

  async function handleSubmit(e) {
    e.preventDefault();
    const layoutError = validateLayout(layout);
    if (layoutError) {
      setError(layoutError);
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
          total_seats: seatMap.length,
          seat_map_template: seatMap,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Có lỗi xảy ra.");
      }
      setName("");
      setLayout(EMPTY_LAYOUT);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-sand-100 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink/60">Tên máy bay</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="VD: Airbus A321"
            className="w-64 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </label>
      </div>

      <SeatLayoutFields layout={layout} onChange={setLayout} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
        >
          {pending ? "Đang thêm..." : "Thêm máy bay"}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </form>
  );
}
