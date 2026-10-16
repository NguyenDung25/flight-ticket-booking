"use client";

// components/ui/Input.jsx
//
// Dùng cho mọi form sau này (đăng nhập/đăng ký C8, thông tin hành khách C5...).
// `error` hiển thị ngay dưới field — style lỗi đỏ theo token --color-danger,
// không dùng màu đỏ mặc định của trình duyệt.

import { useId } from "react";

export default function Input({ label, error, id, className = "", ...props }) {
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
        id={inputId}
        aria-invalid={Boolean(error)}
        className={`h-11 rounded-lg border bg-white px-3.5 text-sm text-ink placeholder:text-ink/40 focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/20 ${
          error ? "border-danger" : "border-sand-200"
        } ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
