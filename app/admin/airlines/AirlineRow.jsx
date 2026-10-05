"use client";

// app/admin/airlines/AirlineRow.jsx
//
// A2 — 1 dòng hãng bay, có sửa tại chỗ + xóa (xác nhận 2 bước, cùng pattern
// DeleteFlightButton.jsx). Server là nguồn sự thật: 409 khi còn chuyến bay thuộc
// hãng này sẽ được hiện nguyên message do API trả về.

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "rounded-lg border border-sand-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500";

export default function AirlineRow({ airline }) {
  const router = useRouter();
  const [mode, setMode] = useState("view"); // view | edit | confirmDelete
  const [form, setForm] = useState({
    code: airline.code,
    name_vi: airline.name_vi,
    name_en: airline.name_en,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function reset() {
    setMode("view");
    setError(null);
    setForm({ code: airline.code, name_vi: airline.name_vi, name_en: airline.name_en });
  }

  async function call(url, options) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, options);
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

  function handleSave(e) {
    e.preventDefault();
    call(`/api/admin/airlines/${airline.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code.trim(),
        name: { vi: form.name_vi.trim(), en: form.name_en.trim() },
      }),
    });
  }

  function handleDelete() {
    call(`/api/admin/airlines/${airline.id}`, { method: "DELETE" });
  }

  if (mode === "edit") {
    return (
      <tr className="border-b border-sand-100 bg-sand-50/50 last:border-0">
        <td className="px-4 py-3">
          <input
            value={form.code}
            onChange={(e) => update("code", e.target.value)}
            maxLength={3}
            className={`${inputCls} w-20 uppercase`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.name_vi}
            onChange={(e) => update("name_vi", e.target.value)}
            className={`${inputCls} w-full min-w-[140px]`}
          />
        </td>
        <td className="px-4 py-3">
          <input
            value={form.name_en}
            onChange={(e) => update("name_en", e.target.value)}
            className={`${inputCls} w-full min-w-[140px]`}
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="rounded-lg bg-sea-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                {pending ? "Đang lưu..." : "Lưu"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="rounded-lg bg-sand-100 px-3 py-1 text-xs font-medium text-ink"
              >
                Bỏ qua
              </button>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-sand-100 last:border-0">
      <td className="px-4 py-3 font-mono text-xs font-semibold text-sea-700">{airline.code}</td>
      <td className="px-4 py-3">{airline.name_vi}</td>
      <td className="px-4 py-3 text-ink/70">{airline.name_en}</td>
      <td className="px-4 py-3">
        {mode === "confirmDelete" ? (
          <div className="flex w-52 flex-col gap-2">
            <p className="text-xs font-medium text-danger">Xóa hãng này — không thể hoàn tác.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="rounded-lg border border-sea-700 px-3 py-1 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
            >
              Sửa
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
