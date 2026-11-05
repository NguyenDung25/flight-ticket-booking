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
    perm: "dashboard",
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
    perm: "users_view",
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
    perm: "bookings",
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
    perm: "flights",
    label: "Chuyến bay",
    icon: (
      <svg {...svgProps}>
        <path d="M21 3L3 10.5l6.5 2.5L12 19.5 21 3z" />
        <path d="M9.5 13L21 3" />
      </svg>
    ),
  },
  {
    href: "/admin/prices",
    perm: "flight_prices",
    label: "Giá vé",
    icon: (
      <svg {...svgProps}>
        <path d="M12 3v18M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.6 0-4.2 1.2-4.2 3 0 4.2 9 2 9 6.4 0 1.8-1.8 3.1-4.8 3.1-2.2 0-4-.8-5-2.2" />
      </svg>
    ),
  },
  {
    href: "/admin/aircraft",
    perm: "aircraft",
    label: "Máy bay",
    icon: (
      <svg {...svgProps}>
        {/* Hình máy bay nhìn từ trên xuống (thân, 2 cánh, đuôi) */}
        <path d="M16 10h4a2 2 0 010 4h-4l-4 7H9l2-7H7l-2 2H2l2-4-2-4h3l2 2h4L9 3h3l4 7z" />
      </svg>
    ),
  },
  {
    href: "/admin/promotions",
    perm: "promotions",
    label: "Khuyến mãi",
    icon: (
      <svg {...svgProps}>
        <path d="M3 12V4h8l10 10-8 8L3 12z" />
        <circle cx="7.5" cy="8.5" r="1.2" />
      </svg>
    ),
  },
  {
    href: "/admin/ancillaries",
    perm: "ancillaries",
    label: "Dịch vụ bổ sung",
    icon: (
      <svg {...svgProps}>
        <rect x="5" y="7" width="14" height="13" rx="2" />
        <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M9 11v6M15 11v6" />
      </svg>
    ),
  },
  {
    href: "/admin/refunds",
    perm: "refunds",
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
    perm: "logs",
    label: "Nhật ký thao tác",
    icon: (
      <svg {...svgProps}>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M15 3v4h4M9 12h7M9 16h7M9 8h3" />
      </svg>
    ),
  },
];

import { can } from "../../config/adminRoles";

/** Các mục menu mà vai trò được phép dùng. */
export function visibleNavItems(role) {
  return NAV_ITEMS.filter((i) => can(role, i.perm));
}

/** Trang quản trị đầu tiên vai trò được phép vào (dùng khi vào /admin mà không có quyền xem Tổng quan). */
export function firstAllowedHref(role) {
  return visibleNavItems(role)[0]?.href ?? null;
}

export function isActive(pathname, href) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getPageTitle(pathname) {
  const item = NAV_ITEMS.find((i) => isActive(pathname, i.href));
  return item ? item.label : "Quản trị";
}
