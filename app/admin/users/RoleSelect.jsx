"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/config/adminRoles";

// Phân quyền quản trị: chỉ ADMIN IT thấy ô này. Không tự đổi vai trò của chính mình.
export default function RoleSelect({ userId, role, isSelf }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  if (isSelf) {
    return <span className="text-xs text-ink/50">Tài khoản của bạn</span>;
  }

  async function handleChange(e) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      router.refresh();
    } catch (err) {
      setValue(prev);
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Vai trò"
        value={value}
        onChange={handleChange}
        disabled={pending}
        title={ROLE_DESCRIPTIONS[value]}
        className="w-32 rounded-lg border border-sand-100 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sea-500 disabled:opacity-50"
      >
        <option value="customer">{ROLE_LABELS.customer}</option>
        {ADMIN_ROLES.map((r) => (
          <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
