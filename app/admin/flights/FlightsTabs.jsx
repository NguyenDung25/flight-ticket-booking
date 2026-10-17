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
