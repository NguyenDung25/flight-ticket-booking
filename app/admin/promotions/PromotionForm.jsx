"use client";

// app/admin/promotions/PromotionForm.jsx
//
// A5 — tạo mã khuyến mãi mới. Cùng convention với AircraftForm/AirlineForm:
// form luôn hiện (không collapse — chỉ vài field, khác FlightForm.jsx nhiều
// field hơn nên mới cần thu gọn).
//
// valid_from/valid_until dùng type="date" (KHÔNG datetime-local như
// FlightForm) — Promotion chỉ cần chính xác tới NGÀY (đúng model: so sánh
// bằng nowVN().toDate() ở promotionService.applyPromotion(), không có yêu
// cầu chính xác tới giờ như giờ bay).

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PromotionForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();

    // "Từ ngày" == "Đến ngày" giờ HỢP LỆ — đại diện mã giảm giá chỉ dùng
    // đúng 1 ngày (server quy đổi valid_until thành 00:00 giờ VN của NGÀY
    // KẾ TIẾP, xem app/api/admin/promotions/route.js, nên valid_until luôn
    // > valid_from ở DB dù 2 ngày này bằng nhau trên form) — chỉ chặn khi
    // "Đến ngày" ĐI TRƯỚC "Từ ngày", không chặn khi bằng nhau.
    if (validUntil && validFrom && validUntil < validFrom) {
      setError("Ngày hết hạn phải từ ngày bắt đầu trở đi.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discount_percent: Number(discountPercent),
          valid_from: validFrom,
          valid_until: validUntil,
          usage_limit: usageLimit,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Có lỗi xảy ra.");
      }
      setCode("");
      setDiscountPercent("");
      setValidFrom("");
      setValidUntil("");
      setUsageLimit("");
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
          <label className="text-xs font-medium text-ink/60">Mã</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            placeholder="VD: SUMMER26"
            className="w-40 rounded-lg border border-sand-100 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Giảm giá (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            required
            className="w-28 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Từ ngày</label>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            required
            className="rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Đến ngày</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            required
            className="rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Giới hạn lượt dùng</label>
          <input
            type="number"
            min={1}
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
            placeholder="Để trống = không giới hạn"
            className="w-44 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
        >
          {pending ? "Đang tạo..." : "Tạo mã"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
    </form>
  );
}
