"use client";

// app/admin/bookings/CancelBookingButton.jsx
//
// A3 — hủy vé thay mặt khách. Dùng CHUNG route PATCH /api/bookings/[id]/cancel
// với C9 (khách tự hủy) — route đó tự phân biệt "đang gọi là chủ booking hay
// admin" qua session, ở ĐÂY chỉ cần gọi đúng endpoint kèm reason.
//
// reason BẮT BUỘC khi admin hủy (route sẽ từ chối 400 nếu thiếu, xem comment
// trong route) — dùng form nhỏ mở rộng tại chỗ thay vì window.prompt() để
// không phụ thuộc UI trình duyệt, nhất quán với style Input/Button đã có.

import { useState } from "react";
import { useRouter } from "next/navigation";

const CANCELLABLE_STATUSES = ["pending_payment", "confirmed"];

export default function CancelBookingButton({ bookingId, status }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (!CANCELLABLE_STATUSES.includes(status)) return null;

  function reset() {
    setExpanded(false);
    setReason("");
    setError(null);
  }

  async function handleConfirm() {
    if (!reason.trim()) {
      setError("Cần nhập lý do hủy.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Có lỗi xảy ra.");
      }
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
        className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
      >
        Hủy vé
      </button>
    );
  }

  return (
    <div className="flex w-56 flex-col gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Lý do hủy (bắt buộc)"
        autoFocus
        className="rounded-lg border border-sand-100 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sea-500"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="flex-1 rounded-lg bg-danger px-2 py-1 text-xs font-medium text-white transition-opacity disabled:opacity-50"
        >
          {pending ? "Đang hủy..." : "Xác nhận"}
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
