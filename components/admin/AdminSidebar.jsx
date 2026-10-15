"use client";

// components/admin/AdminSidebar.jsx
//
// Menu bên trái khu Admin, cùng tông cam đào với khu khách: khối thương hiệu cam đậm ở trên, thân menu
// kem đào, mục đang mở là nút cam. Từ md trở lên: cột dọc cố định bên trái; màn hình hẹp: thành 1 hàng
// ngang cuộn được ở trên cùng. Mục đang mở được tô theo đường dẫn hiện tại.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./adminNav";

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 border-sand-100 bg-sea-50 text-sea-900 md:sticky md:top-0 md:h-screen md:w-64 md:overflow-y-auto md:border-r">
      <Link
        href="/admin"
        className="relative block overflow-hidden bg-gradient-to-br from-coral-500 to-coral-600 px-6 py-5 text-white"
      >
        <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-amber-300/40 blur-2xl" />
        <span className="relative block font-display text-xl font-bold leading-tight">DelayX</span>
        <span className="relative mt-1 block text-xs font-medium text-white">Khu vực quản trị</span>
      </Link>

      <nav
        aria-label="Menu quản trị"
        className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:overflow-visible md:py-4"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-3.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-[14.5px] font-medium transition-colors ${
                active ? "bg-coral-500 font-semibold text-white shadow-sm" : "hover:bg-sea-100"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
