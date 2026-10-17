"use client";

import { useId } from "react";

export default function DatePicker({ label, error, id, className = "", ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink/80">
          {label}
        </label>
      )}
      <input
        type="date"
        id={inputId}
        aria-invalid={Boolean(error)}
        className={`h-11 rounded-lg border bg-white px-3.5 text-sm text-ink focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20 ${
          error ? "border-danger" : "border-sand-200"
        } ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
