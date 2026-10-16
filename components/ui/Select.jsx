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
        <label htmlFor={selectId} className="text-sm font-medium text-ink/80">
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={Boolean(error)}
        className={`h-11 rounded-lg border bg-white px-3.5 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20 ${
          error ? "border-danger" : "border-sand-200"
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
