// app/admin/flights/FlightsTabs.jsx
//
// Thanh tab của mục "Chuyến bay": "Danh sách chuyến bay" (mặc định) và "Tuyến phổ biến" (?tab=routes —
// quản lý khối "Tuyến bay phổ biến" ở trang chủ khách). Cả hai cùng nằm dưới 1 mục menu Chuyến bay.
// Server Component thuần (chỉ là 2 liên kết).

import Link from "next/link";

const TABS = [
  { id: "flights", href: "/admin/flights", label: "Danh sách chuyến bay" },
  { id: "routes", href: "/admin/flights?tab=routes", label: "Tuyến phổ biến" },
];

export default function FlightsTabs({ active }) {
  return (
    <div role="navigation" aria-label="Chuyến bay" className="flex gap-1 border-b border-sand-100">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              on
                ? "border-coral-500 text-coral-600"
                : "border-transparent text-ink/60 hover:bg-sea-50 hover:text-sea-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
