"use client";

// components/admin/AdminTopbar.jsx
//
// Thanh trên cùng khu Admin: tên trang đang mở, nút về giao diện khách, email admin, đăng xuất.
// Là client component chỉ để đọc usePathname (lấy tên trang); đăng xuất dùng lại signOutAction của
// khu khách (components/layout/authActions.js) — server action import được từ client component.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/components/layout/authActions";
import { getPageTitle } from "./adminNav";

export default function AdminTopbar({ email }) {
  const pathname = usePathname();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 bg-white px-6 py-3.5 md:px-8">
      <h2 className="text-[17px] font-semibold text-sea-900">{getPageTitle(pathname)}</h2>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/"
          className="rounded-lg border border-coral-600 px-3.5 py-1.5 text-[13px] font-semibold text-coral-600 transition-colors hover:bg-coral-600 hover:text-white"
        >
          ← Về giao diện khách
        </Link>
        <span className="text-[13px] text-ink/60">{email}</span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-2 py-1.5 text-[13px] font-semibold text-danger hover:underline"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-[18px] w-[18px]"
            >
              <path d="M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5M15 8l4 4-4 4M19 12H9" />
            </svg>
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}
