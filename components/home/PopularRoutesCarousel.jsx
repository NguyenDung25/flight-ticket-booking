"use client";

// components/home/PopularRoutesCarousel.jsx
//
// Carousel "Tuyến bay phổ biến": hàng thẻ cao có ảnh điểm đến, ô đếm "n/N" góc phải trên, tên tuyến, giá
// thấp nhất "Từ ... VND*", chuyến gần nhất và nút "Mua ngay". Vuốt/cuộn ngang (scroll-snap), mũi tên trái/phải
// ở hai đầu. Toàn bộ chữ + số liệu do page.js (Server Component) dựng sẵn rồi truyền xuống — component này
// chỉ lo hiển thị và cuộn, không tự gọi DB.

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
  "absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-coral-600 shadow-md transition-opacity hover:bg-sea-50 disabled:pointer-events-none disabled:opacity-0";

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

  // ResizeObserver gọi lại ngay khi bắt đầu quan sát và mỗi lần đổi kích thước -> mũi tên đúng trạng thái
  // từ đầu (ví dụ ít thẻ, không cần cuộn thì cả hai mũi tên tự ẩn).
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
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c) => (
          <li
            key={c.key}
            className="w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%] xl:w-[24%]"
          >
            <article className="relative flex h-[27rem] flex-col justify-between overflow-hidden rounded-2xl bg-sea-900 text-white shadow-md sm:h-[30rem]">
              <RouteArt motif={c.art.motif} sky={c.art.sky} id={c.key} />
              {c.imageSrc && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${c.imageSrc})` }}
                />
              )}
              {/* lớp tối để chữ trắng luôn đọc được trên mọi ảnh/hình nền */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/5 to-black/75"
              />

              <div className="relative flex justify-end p-3">
                <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-medium">
                  {c.index}/{c.total}
                </span>
              </div>

              <h3 className="relative px-5 text-xl font-bold leading-snug drop-shadow-md">{c.title}</h3>

              <div className="relative flex flex-col gap-3 p-4 pt-2">
                <div className="text-right drop-shadow">
                  {c.priceText ? (
                    <>
                      <p className="text-sm">{labels.from}</p>
                      <p className="text-2xl font-bold">{c.priceText}*</p>
                    </>
                  ) : null}
                  <p className="text-sm">{c.nextLabel}</p>
                  <p className="text-sm">{labels.oneWay}</p>
                </div>
                <Link
                  href={c.href}
                  aria-label={`${labels.buyNow}: ${c.title}`}
                  className="block rounded-xl bg-coral-500 px-4 py-3.5 text-center text-base font-semibold text-white transition-colors hover:bg-coral-600 after:absolute after:inset-0 after:content-['']"
                >
                  {labels.buyNow}
                </Link>
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
