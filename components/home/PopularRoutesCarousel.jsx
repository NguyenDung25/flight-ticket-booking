"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import RouteArt from "./RouteArt";

function Chevron({ dir }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

const ARROW =
  "absolute top-[6.5rem] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-sand-200 bg-white text-ink transition-opacity hover:border-ink/40 disabled:pointer-events-none disabled:opacity-0";

export default function PopularRoutesCarousel({ cards, labels }) {
  const listRef = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const updateEdges = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  // ResizeObserver gọi lại ngay khi bắt đầu quan sát và mỗi lần đổi kích thước -> mũi tên đúng trạng thái từ đầu.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateEdges]);

  const scrollByCard = (dir) => {
    const el = listRef.current;
    if (!el) return;
    const first = el.querySelector("li");
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={labels.prev}
        disabled={edge.start}
        onClick={() => scrollByCard(-1)}
        className={`${ARROW} -left-3 md:-left-5`}
      >
        <Chevron dir="left" />
      </button>

      <ul
        ref={listRef}
        onScroll={updateEdges}
        tabIndex={0}
        aria-label={labels.region}
        className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto scroll-smooth px-1 pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c) => (
          <li
            key={c.key}
            className="w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%] xl:w-[24%]"
          >
            {/* Thẻ tuyến: ảnh phía trên, thông tin trên nền trắng — cả thẻ là 1 liên kết. */}
            <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-sand-100 bg-white transition-colors hover:border-sand-200">
              <div className="relative h-52 overflow-hidden bg-sea-100">
                <RouteArt motif={c.art.motif} sky={c.art.sky} id={c.key} />
                {c.imageSrc && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
                    style={{ backgroundImage: `url(${c.imageSrc})` }}
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="text-base font-semibold leading-snug text-ink">
                  {/* after: phủ cả thẻ -> bấm bất kỳ đâu trên thẻ đều mở trang tìm chuyến của tuyến */}
                  <Link
                    href={c.href}
                    aria-label={`${labels.buyNow}: ${c.title}`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-coral-500"
                  >
                    {c.title}
                  </Link>
                </h3>
                <p className="text-sm text-ink/60">{c.nextLabel}</p>
                <p className="mt-auto pt-3 text-sm text-ink/60">
                  {c.priceText ? (
                    <>
                      {labels.oneWay} · {labels.from.toLowerCase()}{" "}
                      <span className="whitespace-nowrap text-lg font-bold text-ink">{c.priceText}*</span>
                    </>
                  ) : (
                    labels.oneWay
                  )}
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>

      <button
        type="button"
        aria-label={labels.next}
        disabled={edge.end}
        onClick={() => scrollByCard(1)}
        className={`${ARROW} -right-3 md:-right-5`}
      >
        <Chevron dir="right" />
      </button>
    </div>
  );
}
