"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-32 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500 disabled:bg-sand-100 disabled:text-ink/30";

function PriceRow({ flight }) {
  const router = useRouter();
  const [economy, setEconomy] = useState(String(flight.economy));
  const [business, setBusiness] = useState(String(flight.business));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null); // { type: "ok" | "error", text }
  const cancelled = flight.status === "cancelled";

  async function handleSave(e) {
    e.preventDefault();
    if (economy === "" || Number(economy) < 0) {
      setMessage({ type: "error", text: "Giá phổ thông không hợp lệ." });
      return;
    }
    if (flight.has_business_seats && (business === "" || Number(business) < 0)) {
      setMessage({ type: "error", text: "Chuyến có ghế thương gia — bắt buộc nhập giá thương gia." });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/flights/${flight.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_price: {
            economy: Number(economy),
            ...(flight.has_business_seats ? { business: Number(business) } : {}),
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      setMessage({ type: "ok", text: "Đã lưu." });
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <tr className="border-b border-sand-100 last:border-0">
      <td className="px-4 py-3 font-mono text-xs">{flight.flight_number}</td>
      <td className="px-4 py-3">{flight.route}</td>
      <td className="px-4 py-3 text-ink/60">{flight.departure}</td>
      <td className="px-4 py-3">
        <input
          type="number" min={0} step={1000} aria-label={`Giá phổ thông ${flight.flight_number}`} className={inputClass}
          value={economy} disabled={cancelled || pending}
          onChange={(e) => { setMessage(null); setEconomy(e.target.value); }}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number" min={0} step={1000} aria-label={`Giá thương gia ${flight.flight_number}`} className={inputClass}
          value={business} disabled={cancelled || pending || !flight.has_business_seats}
          onChange={(e) => { setMessage(null); setBusiness(e.target.value); }}
        />
      </td>
      <td className="px-4 py-3">
        {cancelled ? (
          <span className="text-xs text-ink/50">Chuyến đã hủy</span>
        ) : (
          <form onSubmit={handleSave} className="flex items-center gap-2">
            <button
              type="submit" disabled={pending}
              className="rounded-lg bg-sea-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
            >
              {pending ? "Đang lưu..." : "Lưu giá"}
            </button>
            {message && (
              <span role={message.type === "error" ? "alert" : "status"} className={`text-xs ${message.type === "error" ? "text-danger" : "text-sea-700"}`}>
                {message.text}
              </span>
            )}
          </form>
        )}
      </td>
    </tr>
  );
}

export default function PriceTable({ flights }) {
  if (flights.length === 0) {
    return <p className="rounded-xl border border-sand-100 bg-white p-4 text-sm text-ink/60">Chưa có chuyến bay nào.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
          <tr>
            <th className="px-4 py-3">Chuyến</th>
            <th className="px-4 py-3">Tuyến</th>
            <th className="px-4 py-3">Giờ bay (VN)</th>
            <th className="px-4 py-3">Giá phổ thông (đ)</th>
            <th className="px-4 py-3">Giá thương gia (đ)</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f) => (
            <PriceRow key={f.id} flight={f} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
