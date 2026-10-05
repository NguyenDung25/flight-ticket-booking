"use client";

// components/layout/MobileMenu.jsx
//
// Hamburger + drawer nav cho mobile. Tách riêng khỏi Header (Server Component)
// vì cần useState để toggle mở/đóng. Dùng Link từ next-intl/navigation để
// giữ locale khi điều hướng — cùng convention với Header.jsx.

import { useState } from "react";
import { Link } from "@/i18n/navigation";

export default function MobileMenu({ links }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      {/* Nút hamburger */}
      <button
        type="button"
        aria-label="Mở menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-sea-900 hover:bg-sand-100"
      >
        {open ? (
          // X
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          // Hamburger
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+1px)] z-50 border-b border-sand-100 bg-sand-50/95 px-6 py-4 shadow-md backdrop-blur md:hidden">
          <nav className="flex flex-col gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-base font-medium text-sea-900 hover:text-coral-600"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
