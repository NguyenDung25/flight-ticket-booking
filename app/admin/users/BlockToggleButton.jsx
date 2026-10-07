"use client";

// app/admin/users/BlockToggleButton.jsx
//
// A4 — nút khóa/mở khóa. router.refresh() sau khi thành công để bảng ở
// page.js (Server Component) tự re-fetch dữ liệu mới — KHÔNG tự cập nhật
// state cục bộ song song với server (tránh 2 nguồn sự thật lệch nhau).

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BlockToggleButton({ userId, isBlocked }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_blocked: !isBlocked }),
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

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
          isBlocked
            ? "bg-sea-500 text-white hover:bg-sea-700"
            : "border border-danger text-danger hover:bg-danger hover:text-white"
        }`}
      >
        {isBlocked ? "Mở khóa" : "Khóa"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-xs font-medium text-danger">
        {isBlocked ? "Mở khóa tài khoản này?" : "Khóa tài khoản này?"}
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className={`rounded-lg px-2 py-1 text-xs font-medium text-white disabled:opacity-50 ${
            isBlocked ? "bg-sea-500 hover:bg-sea-700" : "bg-danger hover:opacity-90"
          }`}
        >
          {pending ? "..." : "Xác nhận"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setError(null); }}
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
