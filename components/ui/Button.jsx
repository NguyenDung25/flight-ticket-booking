"use client";

// components/ui/Button.jsx
//
// "use client" vì component tương tác chung (nhận onClick tuỳ ý từ nơi gọi)
// — đánh dấu client 1 lần ở đây để mọi nơi khác (kể cả Server Component)
// dùng được thẳng mà không cần lo boundary.

const VARIANT_CLASSES = {
  // CTA chính (tìm chuyến, thanh toán, xác nhận) — nền cam đất, chữ trắng.
  primary:
    "bg-coral-500 text-white hover:bg-coral-600 focus-visible:outline-coral-600",
  // Hành động phụ (quay lại, thêm hành khách) — nền trắng, viền xám ấm.
  secondary:
    "bg-white text-ink border border-sand-200 hover:border-ink/40 hover:bg-sand-50",
  // Hành động nhẹ (đăng xuất, hủy) — không viền, chỉ đổi nền khi hover.
  ghost: "bg-transparent text-ink hover:bg-sand-100",
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
