"use client";

// app/admin/flights/DeleteFlightButton.jsx
//
// A1 (ghi chú v) — xóa HẲN 1 chuyến bay (DELETE /api/admin/flights/[id]).
// Cùng pattern xác nhận 2 bước với CancelFlightButton.jsx (A8) để nhất quán
// UI trong khu Admin — KHÔNG dùng modal (dự án cố tình không có
// Modal/dialog riêng, xem comment gốc app/[locale]/my-bookings/BookingList.jsx).
//
// KHÁC CancelFlightButton: route DELETE đã tự chặn (409, qua
// assertNoActiveBooking) nếu chuyến còn booking hiệu lực (pending_payment/
// confirmed) — nút này KHÔNG tự kiểm tra lại điều đó ở client, chỉ cần hiện
// đúng data?.message trả về khi bị 409, đúng nguyên tắc "server là nguồn sự
// thật" đã dùng xuyên suốt các nút khác (Edit/Cancel) trong FlightsTable.jsx.
//
// KHÔNG cần ô nhập lý do như Hủy chuyến (A8) — xóa hẳn khỏi DB không phải
// hành động nghiệp vụ cần lưu vết lý do, khác cancel-bulk (còn cascade sang
// Booking, cần giải thích cho khách qua email/log).

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteFlightButton({ flightId }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function reset() {
    setExpanded(false);
    setError(null);
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/flights/${flightId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 409 (còn booking hiệu lực) dùng chung message do
        // assertNoActiveBooking ném ra — hiện thẳng, không tự diễn giải lại.
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
        className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white"
      >
        Xóa
      </button>
    );
  }

  return (
    <div className="flex w-56 flex-col gap-2">
      <p className="text-xs font-medium text-danger">Xóa hẳn chuyến này — không thể hoàn tác.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="flex-1 rounded-lg bg-danger px-2 py-1 text-xs font-medium text-white transition-opacity disabled:opacity-50"
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
  );
}
