"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { hideCurrentPage } from "./navFilter";

export default function DesktopNav({ links }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-5 whitespace-nowrap text-sm font-medium text-ink lg:flex xl:gap-7 xl:text-[15px]">
      {hideCurrentPage(links, pathname).map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-coral-600">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
