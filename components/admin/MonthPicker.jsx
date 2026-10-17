"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const BTN =
  "rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-sea-900 transition-colors hover:bg-sea-50";
const BTN_OFF = "rounded-lg border border-sand-100 px-3 py-1.5 text-[13px] font-semibold text-ink/40";

const hrefOf = (ym, current) => (ym === current ? "/admin" : `/admin?month=${ym}`);

export default function MonthPicker({ options, selected, current, prev, next }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {prev ? (
        <Link href={hrefOf(prev, current)} className={BTN}>
          ← Tháng trước
        </Link>
      ) : (
        <span aria-disabled="true" className={BTN_OFF}>
          ← Tháng trước
        </span>
      )}

      <label htmlFor="admin-month" className="sr-only">
        Chọn tháng xem doanh thu
      </label>
      <select
        id="admin-month"
        value={selected}
        onChange={(e) => router.push(hrefOf(e.target.value, current))}
        className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-sea-900 focus:outline-none focus:ring-2 focus:ring-sea-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {next ? (
        <Link href={hrefOf(next, current)} className={BTN}>
          Tháng sau →
        </Link>
      ) : (
        <span aria-disabled="true" className={BTN_OFF}>
          Tháng sau →
        </span>
      )}

      {selected !== current && (
        <Link href="/admin" className="text-[13px] font-semibold text-coral-600 underline">
          Về tháng này
        </Link>
      )}
    </div>
  );
}
