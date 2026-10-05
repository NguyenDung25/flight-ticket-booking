"use client";

// app/admin/bookings/ManualRefundButton.jsx
//
// A3 — ngoại lệ DUY NHẤT cho admin nhập tay số tiền hoàn: booking
// `payment_error_manual_refund` (Momo trừ tiền thành công nhưng ghế đã mất do
// race-condition, ghi chú y). Gọi PATCH /api/admin/bookings/[id].
//
// Hệ thống chỉ GHI NHẬN số tiền — admin tự chuyển trả khách ngoài hệ thống (Momo hoàn
// tiền tự động chưa làm, xem A7). Số tiền mặc định = toàn bộ số khách đã bị trừ.

import { useState } from "react";
import { useRouter } from "next/navigation";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

export default function ManualRefundButton({ bookingId, status, totalAmount }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState(String(totalAmount));
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (status !== "payment_error_manual_refund") return null;

  function reset() {
    setExpanded(false);
    setAmount(String(totalAmount));
    setNote("");
    setError(null);
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refund_amount: Number(amount), note: note.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-lg bg-coral-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-coral-600"
      >
        Hoàn tiền tay
      </button>
    );
  }

  return (
    <div className="flex w-60 flex-col gap-2">
      <label className="text-[11px] font-medium text-ink/60">
        Số tiền hoàn (đồng) — khách đã bị trừ {CURRENCY_FORMATTER.format(totalAmount)}đ
      </label>
      <input
        type="number"
        min={1}
        max={totalAmount}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="rounded-lg border border-sand-100 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sea-500"
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú (VD: đã chuyển khoản ngày...)"
        className="rounded-lg border border-sand-100 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sea-500"
      />
      <p className="text-[11px] text-ink/50">
        Chỉ ghi nhận số tiền — bạn tự chuyển trả khách ngoài hệ thống.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="flex-1 rounded-lg bg-sea-500 px-2 py-1 text-xs font-medium text-white transition-opacity disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Xác nhận đã hoàn"}
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
  );
}
