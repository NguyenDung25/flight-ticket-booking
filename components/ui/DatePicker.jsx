"use client";

// components/ui/DatePicker.jsx
//
// CỐ TÌNH dùng <input type="date"> gốc thay vì tự vẽ lịch — mọi trình duyệt
// hiện đại đều có UI chọn ngày sẵn (kể cả mobile, quan trọng vì đồ án không
// có thời gian test đa thiết bị kỹ), không kéo thêm thư viện ngoài chỉ cho
// 1 form. Nhận `min`/`max` (chuỗi "YYYY-MM-DD") qua props như input gốc —
// nơi gọi tự tính (VD ngày về không được trước ngày đi).

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
