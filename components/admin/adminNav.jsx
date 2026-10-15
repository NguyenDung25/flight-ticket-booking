// components/admin/adminNav.jsx
//
// Danh sách mục menu bên trái khu Admin + tiêu đề trang cho thanh trên cùng — dùng chung cho
// AdminSidebar và AdminTopbar (cả hai là client component vì cần usePathname).
// Thống kê KHÔNG còn là 1 mục menu: số liệu doanh thu nằm ngay ở trang Tổng quan (/admin).

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "h-5 w-5 shrink-0",
};

export const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Tổng quan",
    icon: (
      <svg {...svgProps}>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "Người dùng",
    icon: (
      <svg {...svgProps}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
        <path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.9.7 3.2 2.4 3.5 5.2" />
      </svg>
    ),
  },
  {
    href: "/admin/bookings",
    label: "Booking",
    icon: (
      <svg {...svgProps}>
        <path d="M4 7h16a1 1 0 011 1v2.5a1.5 1.5 0 000 3V16a1 1 0 01-1 1H4a1 1 0 01-1-1v-2.5a1.5 1.5 0 000-3V8a1 1 0 011-1z" />
        <path d="M14 7v10" />
      </svg>
    ),
  },
  {
    href: "/admin/flights",
    label: "Chuyến bay",
    icon: (
      <svg {...svgProps}>
        <path d="M21 3L3 10.5l6.5 2.5L12 19.5 21 3z" />
        <path d="M9.5 13L21 3" />
      </svg>
    ),
  },
  {
    href: "/admin/airlines",
    label: "Hãng bay",
    icon: (
      <svg {...svgProps}>
        <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
      </svg>
    ),
  },
  {
    href: "/admin/aircraft",
    label: "Máy bay",
    icon: (
      <svg {...svgProps}>
        <path d="M7 4h6a2 2 0 012 2v6H7V6a2 2 0 012-2zM6 12h12v3a2 2 0 01-2 2H8a2 2 0 01-2-2zM9 17v3M15 17v3" />
      </svg>
    ),
  },
  {
    href: "/admin/promotions",
    label: "Khuyến mãi",
    icon: (
      <svg {...svgProps}>
        <path d="M3 12V4h8l10 10-8 8L3 12z" />
        <circle cx="7.5" cy="8.5" r="1.2" />
      </svg>
    ),
  },
  {
    href: "/admin/refunds",
    label: "Hoàn tiền",
    icon: (
      <svg {...svgProps}>
        <path d="M3 12a9 9 0 109-9 9.8 9.8 0 00-6.7 2.8L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    ),
  },
  {
    href: "/admin/logs",
    label: "Nhật ký thao tác",
    icon: (
      <svg {...svgProps}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4M9 12h7M9 16h7M9 8h3" />
      </svg>
    ),
  },
];

export function isActive(pathname, href) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getPageTitle(pathname) {
  const item = NAV_ITEMS.find((i) => isActive(pathname, i.href));
  return item ? item.label : "Quản trị";
}
