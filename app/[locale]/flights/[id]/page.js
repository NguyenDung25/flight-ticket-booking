// app/[locale]/flights/[id]/page.js
//
// C3 — chi tiết 1 chuyến bay. Đây cũng là nơi quyết định BƯỚC TIẾP THEO của
// wizard khứ hồi 3 bước (đúng đặc tả gốc: bước 1 chọn chuyến đi, bước 2 chọn
// chuyến về — danh sách ĐỔI sau bước 1, bước 3 tóm tắt cả 2 chặng + tổng giá
// trước khi sang C4 nhập hành khách):
//
// - one_way                          -> "Chọn chuyến này" đi thẳng
//   /booking/summary?outboundFlightId=... (bước xác nhận, CHƯA làm — 404 là
//   đúng, cùng pattern mọi bước trước).
// - round_trip, leg=outbound (bước 1) -> "Chọn chuyến này" quay lại /search
//   kèm outboundFlightId — /search TỰ chuyển sang chế độ "bước 2" (chỉ hiện
//   chặng về), xem app/[locale]/search/page.js. KHÔNG cần dựng màn hình
//   bước-2 riêng, tái dùng nguyên hạ tầng /search + FlightCard đã có.
// - round_trip, leg=return (bước 2)   -> "Chọn chuyến này" đi tới
//   /booking/summary?outboundFlightId=...&returnFlightId=... (bước 3).
//
// searchContext (origin/destination/departureDate/tripType/returnDate/
// passengerCount) LUÔN được mang theo nguyên vẹn qua mọi bước — không được
// làm rớt ở bất kỳ link nào, nếu không bước sau sẽ thiếu tham số.

import { getTranslations, getLocale, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { getFlightDetail, FlightError } from "@/services/flightService";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import { toVN } from "@/lib/timezone";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

function formatDuration(departure, arrival) {
  const minutesTotal = arrival.diff(departure, "minute");
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;
  return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
}

function countAvailable(seats, seatClass) {
  return seats.filter((s) => s.seat_class === seatClass && s.status === "available").length;
}

export default async function FlightDetailPage({ params, searchParams }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("FlightDetail");
  const tCommon = await getTranslations("Common");

  await dbConnect();

  let flight = null;
  let errorMessage = null;
  try {
    flight = await getFlightDetail(id);
  } catch (err) {
    // Log lỗi THẬT ra terminal — nếu không, lỗi không phải FlightError (VD
    // CastError do id sai định dạng, DB mất kết nối...) sẽ bị NUỐT hoàn
    // toàn, chỉ còn "Đã có lỗi xảy ra" hiện cho khách, không cách nào biết
    // nguyên nhân thật để debug (đây chính xác là bug vừa gặp lúc test).
    console.error("FlightDetailPage error:", err);
    errorMessage = err instanceof FlightError ? err.message : tCommon("error");
  }

  if (errorMessage || !flight) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{errorMessage}</p>
        <Link href="/" className="text-sm font-medium text-sea-500 hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  // searchContext mang theo NGUYÊN VẸN xuyên suốt wizard — spread lại y hệt
  // những gì FlightCard đã gửi qua, không tự chế thêm/bớt field nào ở đây.
  const searchContext = {
    origin: sp.origin,
    destination: sp.destination,
    departureDate: sp.departureDate,
    tripType: sp.tripType,
    returnDate: sp.returnDate,
    passengerCount: sp.passengerCount,
  };
  const leg = sp.leg; // "outbound" | "return", chỉ có ý nghĩa khi tripType round_trip

  const nextHref =
    searchContext.tripType === "round_trip" && leg === "outbound"
      ? { pathname: "/search", query: { ...searchContext, outboundFlightId: id } }
      : {
          pathname: "/booking/summary",
          query:
            searchContext.tripType === "round_trip"
              ? { ...searchContext, outboundFlightId: sp.outboundFlightId, returnFlightId: id }
              : { ...searchContext, outboundFlightId: id },
        };

  const airlineName = flight.airline_id.name[locale] ?? flight.airline_id.name.vi;
  const departure = toVN(flight.departure_time);
  const arrival = toVN(flight.arrival_time);

  const economyAvailable = countAvailable(flight.seats, "economy");
  const businessAvailable = countAvailable(flight.seats, "business");
  const hasBusiness = flight.base_price.business !== undefined && flight.base_price.business !== null;
  // Đúng công thức FlightCard.jsx đã dùng ở trang kết quả tìm kiếm — hết chỗ
  // nghĩa là CẢ 2 hạng ghế (nếu có business) đều 0, không chỉ riêng economy.
  // Chỉ tắt nút khi thật sự không còn ghế nào để bán, để không chặn oan
  // khách muốn đặt business lúc economy đã hết.
  const totalAvailable = economyAvailable + (hasBusiness ? businessAvailable : 0);
  const soldOut = totalAvailable === 0;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-2xl">
        <Link href="/search" className="text-sm font-medium text-sea-700 hover:underline">
          ← {tCommon("back")}
        </Link>
      </div>

      <Card className="w-full max-w-2xl p-6">
        <p className="text-sm font-medium text-sea-700">
          {airlineName} · {flight.flight_number} · {flight.aircraft_id.name}
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div>
            <p className="font-display text-2xl font-semibold text-ink">
              {departure.format("HH:mm")}
            </p>
            <p className="text-sm text-ink/60">{flight.origin_code}</p>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1">
            <p className="text-xs text-ink/60">{t("duration")}</p>
            <div className="h-px w-full border-t border-dashed border-sand-200" />
            <p className="text-xs text-ink/60">{formatDuration(departure, arrival)}</p>
          </div>
          <div>
            <p className="font-display text-2xl font-semibold text-ink">
              {arrival.format("HH:mm")}
            </p>
            <p className="text-sm text-ink/60">{flight.dest_code}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink/60">{departure.format("DD/MM/YYYY")}</p>

        <div className="mt-6 border-t border-sand-100 pt-4">
          <p className="mb-2 text-sm font-semibold text-ink">{t("seatClass")}</p>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
              <span>{t("economyLabel")}</span>
              <span className="text-ink/60">
                {t("availableSeatsLabel")}: {economyAvailable}
              </span>
              <span className="font-semibold text-coral-600">
                {CURRENCY_FORMATTER.format(flight.base_price.economy)}đ
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2">
              <span>{t("businessLabel")}</span>
              {hasBusiness ? (
                <>
                  <span className="text-ink/60">
                    {t("availableSeatsLabel")}: {businessAvailable}
                  </span>
                  <span className="font-semibold text-coral-600">
                    {CURRENCY_FORMATTER.format(flight.base_price.business)}đ
                  </span>
                </>
              ) : (
                <span className="text-ink/40">{t("notOffered")}</span>
              )}
            </div>
          </div>
        </div>

        {soldOut ? (
          <span className="mt-6 inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-sand-100 px-5 py-3 text-sm font-medium text-danger/70">
            {t("soldOutLabel")}
          </span>
        ) : (
          <Link
            href={nextHref}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-coral-500 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-coral-600"
          >
            {t("selectButton")}
          </Link>
        )}
      </Card>
    </div>
  );
}
