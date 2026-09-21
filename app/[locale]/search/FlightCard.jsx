// app/[locale]/search/FlightCard.jsx
//
// Thẻ 1 chuyến bay trong danh sách kết quả (C1/C2) — dùng Card kiểu "stub"
// (components/ui/Card.jsx, đã có sẵn đúng ý định ban đầu cho C1/C3): thông
// tin chuyến bay bên trái, giá + nút xem chi tiết bên phải như vé giấy thật.
//
// Server Component thuần — không state/sự kiện riêng, chỉ Link điều hướng
// sang trang chi tiết (C3, CHƯA làm — bấm vào sẽ 404, đúng như /search lúc
// trước khi có file này). Mang theo TOÀN BỘ ngữ cảnh tìm kiếm + `leg` qua
// query string để trang chi tiết biết đang chọn đúng chặng nào của lần tìm
// kiếm nào (cần thiết cho khứ hồi: chọn chặng đi xong phải quay lại chọn
// chặng về, không được mất ngữ cảnh ban đầu).

import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import { toVN } from "@/lib/timezone";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

export default function FlightCard({ flight, locale, leg, searchContext, t }) {
  // airline.name là object {vi, en} (models/Airline.js) — KHÔNG phải string.
  const airlineName = flight.airline.name[locale] ?? flight.airline.name.vi;

  const departure = toVN(flight.departure_time);
  const arrival = toVN(flight.arrival_time);

  // base_price là object {economy, business} — hiển thị giá economy làm giá
  // tham khảo chính trên thẻ danh sách; giá đầy đủ theo hạng ghế xem ở C3.
  const priceEconomy = flight.base_price.economy;

  const totalAvailable = flight.available_seats.economy + (flight.available_seats.business ?? 0);
  const soldOut = totalAvailable === 0;

  const flightId = String(flight._id);
  const detailHref = {
    pathname: `/flights/${flightId}`,
    query: { ...searchContext, leg },
  };

  return (
    <Card
      stub={
        <>
          <p className="text-lg font-semibold text-sea-900">
            {CURRENCY_FORMATTER.format(priceEconomy)}đ
          </p>
          {soldOut ? (
            <span className="inline-flex items-center justify-center rounded-lg bg-sand-200 px-5 py-2.5 text-sm font-medium text-ink/40">
              {t("viewDetails")}
            </span>
          ) : (
            <Link
              href={detailHref}
              className="inline-flex items-center justify-center rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600"
            >
              {t("viewDetails")}
            </Link>
          )}
        </>
      }
    >
      <p className="text-sm font-medium text-sea-700">
        {airlineName} · {flight.flight_number}
      </p>

      <div className="mt-2 flex items-center gap-3">
        <div>
          <p className="text-xl font-semibold text-ink">{departure.format("HH:mm")}</p>
          <p className="text-xs text-ink/60">{flight.origin_code}</p>
        </div>
        <span aria-hidden="true" className="text-ink/40">
          →
        </span>
        <div>
          <p className="text-xl font-semibold text-ink">{arrival.format("HH:mm")}</p>
          <p className="text-xs text-ink/60">{flight.dest_code}</p>
        </div>
      </div>

      <p className="mt-2 text-xs text-ink/60">{departure.format("DD/MM/YYYY")}</p>

      <p className={`mt-2 text-xs ${soldOut ? "text-danger" : "text-ink/60"}`}>
        {soldOut ? t("seatsSoldOut") : t("seatsAvailable", { count: totalAvailable })}
      </p>
    </Card>
  );
}
