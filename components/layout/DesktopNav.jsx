"use client";

// components/layout/DesktopNav.jsx — menu ngang trên màn hình lớn (≥ lg). Client Component vì cần
// biết trang hiện tại (usePathname) để ẩn mục menu của chính trang đó (navFilter.js).

import { Link, usePathname } from "@/i18n/navigation";
import { hideCurrentPage } from "./navFilter";

export default function DesktopNav({ links }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-6 text-sm font-medium text-sea-900 lg:flex">
      {hideCurrentPage(links, pathname).map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-coral-600">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
