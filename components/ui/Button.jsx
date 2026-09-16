"use client";

// components/ui/Button.jsx
//
// "use client" vì component tương tác chung (nhận onClick tuỳ ý từ nơi gọi)
// — đánh dấu client 1 lần ở đây để mọi nơi khác (kể cả Server Component)
// dùng được thẳng mà không cần lo boundary.

const VARIANT_CLASSES = {
  // CTA chính (tìm chuyến bay, thanh toán, xác nhận) — coral nổi bật trên nền sand.
  primary:
    "bg-coral-500 text-white hover:bg-coral-600 focus-visible:outline-coral-600",
  // Hành động phụ (quay lại, xem chi tiết) — viền sea, nền trong suốt.
  secondary:
    "bg-transparent text-sea-700 border border-sea-700 hover:bg-sea-700 hover:text-white",
  // Hành động nhẹ (đăng xuất, hủy) — không viền, chỉ đổi nền khi hover.
  ghost: "bg-transparent text-sea-700 hover:bg-sand-100",
};

export default function Button({
  children,
  variant = "primary",
  type = "button",
  className = "",
  ...props
}) {
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary;
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
