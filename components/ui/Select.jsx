"use client";

// components/ui/Select.jsx
//
// Mirror đúng style + convention của Input.jsx (label/error/id-tự-sinh) —
// dùng cho dropdown điểm đi/điểm đến/số hành khách (C1), và sau này hạng ghế
// (C4/C5), bộ lọc kết quả (C2).

import { useId } from "react";

export default function Select({
  label,
  error,
  id,
  options = [],
  placeholder,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const selectId = id || generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={Boolean(error)}
        className={`rounded-lg border bg-sand-50 px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-sea-500 ${
          error ? "border-danger" : "border-sand-100"
        } ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
