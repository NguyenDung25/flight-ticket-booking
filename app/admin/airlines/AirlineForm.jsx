"use client";

// app/admin/airlines/AirlineForm.jsx
//
// A2 — form thêm hãng bay. Validate tối thiểu ở client (required) — validate
// THẬT (unique code, required name.vi/en) nằm ở API + Mongoose schema, form
// này chỉ chặn sớm cho đỡ round-trip vô ích khi để trống.

import { useState } from "react";
import { useRouter } from "next/navigation";

const emptyForm = { code: "", name_vi: "", name_en: "" };

export default function AirlineForm() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/airlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim(),
          name: { vi: form.name_vi.trim(), en: form.name_en.trim() },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Có lỗi xảy ra.");
      }
      setForm(emptyForm);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-100 bg-white p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink/60">Mã (VD: VN)</label>
        <input
          value={form.code}
          onChange={(e) => update("code", e.target.value)}
          required
          maxLength={3}
          className="w-24 rounded-lg border border-sand-100 px-2 py-1.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-sea-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink/60">Tên tiếng Việt</label>
        <input
          value={form.name_vi}
          onChange={(e) => update("name_vi", e.target.value)}
          required
          className="w-48 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-ink/60">Tên tiếng Anh</label>
        <input
          value={form.name_en}
          onChange={(e) => update("name_en", e.target.value)}
          required
          className="w-48 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
      >
        {pending ? "Đang thêm..." : "Thêm hãng bay"}
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}
