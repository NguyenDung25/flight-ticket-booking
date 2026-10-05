"use client";

// app/admin/users/DeleteUserButton.jsx
//
// A4 — xóa hẳn tài khoản khách (DELETE /api/admin/users/[id]). Xác nhận 2 bước, cùng
// pattern DeleteFlightButton. Server chặn (409) nếu tài khoản đã có booking, và chặn
// xóa admin / tự xóa — nút chỉ hiện đúng message API trả về.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteUserButton({ userId, role }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (role === "admin") return null;

  function reset() {
    setExpanded(false);
    setError(null);
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
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
        className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-white"
      >
        Xóa
      </button>
    );
  }

  return (
    <div className="flex w-56 flex-col gap-2">
      <p className="text-xs font-medium text-danger">Xóa hẳn tài khoản — không thể hoàn tác.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
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
  );
}
