"use client";

// app/admin/flights/CancelFlightButton.jsx
//
// A8 — hủy chuyến bay thật (cascade hủy/hoàn tiền toàn bộ booking liên
// quan). Cùng pattern xác nhận 2 bước + bắt buộc lý do như
// app/admin/bookings/CancelBookingButton.jsx (A3) — giữ nhất quán UI trong
// khu Admin, không tự nghĩ ra pattern mới.
//
// Nguy hiểm hơn hẳn A3 (ảnh hưởng NHIỀU booking cùng lúc, không thể hoàn
// tác), nên hiện thêm 1 dòng cảnh báo rõ trong khối xác nhận, khác
// CancelBookingButton.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelFlightButton({ flightId, status }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (status === "cancelled") {
    return <span className="text-xs text-ink/40">Đã hủy</span>;
  }

  function reset() {
    setExpanded(false);
    setReason("");
    setError(null);
  }

  async function handleConfirm() {
    if (!reason.trim()) {
      setError("Cần nhập lý do hủy chuyến.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/flights/${flightId}/cancel-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Có lỗi xảy ra.");
      }
      setResult(data.affected_booking_count);
      // Chờ admin đọc số booking bị ảnh hưởng trước khi router.refresh() xóa
      // luôn khối kết quả này — refresh ngay sẽ làm mất thông báo vừa hiện.
      setTimeout(() => router.refresh(), 2000);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  if (result !== null) {
    return (
      <p className="text-xs font-medium text-sea-700">
        Đã hủy — ảnh hưởng {result} booking.
      </p>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
      >
        Hủy chuyến
      </button>
    );
  }

  return (
    <div className="flex w-64 flex-col gap-2">
      <p className="text-xs font-medium text-danger">
        Hủy TOÀN BỘ booking liên quan chuyến này — không thể hoàn tác.
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Lý do hủy chuyến (bắt buộc)"
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
          {pending ? "Đang hủy..." : "Xác nhận hủy chuyến"}
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
