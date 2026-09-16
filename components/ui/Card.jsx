// components/ui/Card.jsx
//
// Server Component thuần (không "use client") — chỉ hiển thị, không sự kiện.
//
// 2 chế độ:
// - <Card>...</Card>            : khung bo góc đơn giản, dùng chung mọi nơi.
// - <Card stub={<...>}>...</Card>: hình dạng VÉ GIẤY THẬT — nội dung chính
//   bên trái, 1 đường đục lỗ (dashed) + 2 nốt khoét ở giữa, "cuống" (giá,
//   trạng thái, nút CTA) bên phải. Dự định dùng cho kết quả tìm chuyến bay
//   (C1/C3) và tóm tắt vé (C9) — nơi có 1 hành động chính + 1 con số chính
//   (giá / mã vé) cần tách biệt trực quan, đúng như vé máy bay thật.

export default function Card({ children, stub, className = "" }) {
  if (!stub) {
    return (
      <div
        className={`rounded-xl border border-sand-100 bg-sand-50 shadow-sm ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={`ticket-stub relative flex overflow-hidden rounded-xl border border-sand-100 bg-sand-50 shadow-sm ${className}`}
    >
      <div className="flex-1 p-5">{children}</div>
      <div
        aria-hidden="true"
        className="border-l border-dashed border-sea-700/25"
      />
      <div className="flex min-w-[9rem] flex-col items-center justify-center gap-2 p-5 text-center">
        {stub}
      </div>
    </div>
  );
}
