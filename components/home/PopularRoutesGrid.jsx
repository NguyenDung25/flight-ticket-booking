import { Link } from "@/i18n/navigation";
import RouteArt from "./RouteArt";

/** Lưới tuyến bay phổ biến: 2 hàng trên máy tính (4 thẻ mỗi hàng), 2 cột trên điện thoại và máy tính bảng. */
export default function PopularRoutesGrid({ cards, labels }) {
  return (
    <ul aria-label={labels.region} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <li key={c.key}>
          {/* Thẻ tuyến: ảnh phía trên, thông tin trên nền trắng — cả thẻ là 1 liên kết. */}
          <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-sand-100 bg-white transition-colors hover:border-sand-200">
            <div className="relative h-28 overflow-hidden bg-sea-100 sm:h-40">
              <RouteArt motif={c.art.motif} sky={c.art.sky} id={c.key} />
              {c.imageSrc && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
                  style={{ backgroundImage: `url(${c.imageSrc})` }}
                />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
              <h3 className="text-sm font-semibold leading-snug text-ink sm:text-base">
                {/* after: phủ cả thẻ -> bấm bất kỳ đâu trên thẻ đều mở trang tìm chuyến của tuyến */}
                <Link
                  href={c.href}
                  aria-label={`${labels.buyNow}: ${c.title}`}
                  className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-coral-500"
                >
                  {c.title}
                </Link>
              </h3>
              <p className="text-xs text-ink/60 sm:text-sm">{c.nextLabel}</p>
              <p className="mt-auto pt-3 text-xs text-ink/60 sm:text-sm">
                {c.priceText ? (
                  <>
                    {labels.oneWay} · {labels.from.toLowerCase()}{" "}
                    <span className="whitespace-nowrap text-base font-bold text-ink sm:text-lg">{c.priceText}*</span>
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
  );
}
