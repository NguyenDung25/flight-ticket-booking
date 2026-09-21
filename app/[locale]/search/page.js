// app/[locale]/search/page.js
//
// C1/C2 — hiển thị kết quả tìm kiếm. Đọc trực tiếp searchParams từ URL (do
// SearchForm.jsx điều hướng qua router.push), gọi THẲNG
// services/flightService.searchFlights() — Server Component, không cần vòng
// HTTP qua chính /api/flights/search của mình (cùng lý do page.js trang chủ
// đã ghi chú: tiết kiệm 1 round-trip vì đã chạy server-side sẵn).
//
// searchFlights() ném FlightError khi thiếu/sai tham số (VD thiếu origin) —
// BẮT BUỘC bọc try/catch hiển thị lỗi thân thiện thay vì để page crash, vì
// tham số tới từ URL nên khách có thể tự gõ tay sai hoặc sửa link.
//
// C2 (lọc theo giá/khung giờ/hãng bay) xử lý phía CLIENT trên kết quả đã có
// (đúng ghi chú kỹ thuật C2 trong flightService.js) — CHƯA làm ở bước này,
// trang hiện tại chỉ hiển thị nguyên danh sách server trả về.
//
// LUẬT NGHIỆP VỤ MỚI: khứ hồi bắt buộc CÙNG 1 hãng bay cho cả 2 chặng — ở
// bước 2, chặng về chỉ hiện đúng hãng của chặng đi đã chọn (lọc ngay bên
// dưới, sau khi có kết quả từ searchFlights()). CHƯA enforce lại ở
// /booking/summary (bước 3, chưa xây) — khi làm bước đó PHẢI validate lại
// (defense in depth), không chỉ tin UI đã lọc đúng, vì khách có thể tự sửa
// URL để bỏ qua bộ lọc này.
//
// WIZARD KHỨ HỒI — TRANG NÀY ĐÓNG VAI TRÒ CẢ BƯỚC 1 LẪN BƯỚC 2 (xem
// app/[locale]/flights/[id]/page.js để hiểu toàn bộ luồng): mặc định
// (không có outboundFlightId) = bước 1, chỉ hiện chặng đi. Khi khách đã
// chọn xong chặng đi (quay lại đây kèm ?outboundFlightId=...) = bước 2, chỉ
// hiện chặng về + 1 dải xác nhận chuyến đi đã chọn, để không hiện lại chặng
// đi (tránh chọn nhầm/chọn lại) và giữ ngữ cảnh rõ ràng cho khách.

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { searchFlights, getFlightDetail, FlightError } from "@/services/flightService";
import { toVN } from "@/lib/timezone";
import { Link } from "@/i18n/navigation";
import FlightCard from "./FlightCard";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

export default async function SearchResultsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("SearchResults");
  const tCommon = await getTranslations("Common");

  const sp = await searchParams;
  const origin = sp.origin;
  const destination = sp.destination;
  const departureDate = sp.departureDate;
  const tripType = sp.tripType || "one_way";
  const returnDate = sp.returnDate;
  const passengerCount = sp.passengerCount ? Number(sp.passengerCount) : undefined;

  // Có mặt outboundFlightId + đang tìm khứ hồi => đây là BƯỚC 2 của wizard
  // (xem comment đầu file) — chỉ hiện chặng về, không hiện lại chặng đi.
  const isReturnStep = tripType === "round_trip" && Boolean(sp.outboundFlightId);

  let result = null;
  let errorMessage = null;
  let selectedOutbound = null;

  try {
    await dbConnect();
    result = await searchFlights({ origin, destination, departureDate, tripType, returnDate, passengerCount });

    if (isReturnStep) {
      // Chỉ để hiển thị dải xác nhận — lỗi ở đây (VD flight vừa bị admin
      // hủy giữa chừng) KHÔNG được làm sập cả trang, chỉ đơn giản là không
      // hiện dải xác nhận đó nữa.
      try {
        selectedOutbound = await getFlightDetail(sp.outboundFlightId);
      } catch {
        selectedOutbound = null;
      }

      // LUẬT NGHIỆP VỤ: khứ hồi phải CÙNG 1 hãng bay cả 2 chiều — lọc chặng
      // về chỉ giữ lại đúng hãng của chặng đi đã chọn. So bằng String() vì
      // airline._id (từ aggregation $lookup) và airline_id._id (từ
      // populate() của getFlightDetail) đều là ObjectId, so trực tiếp bằng
      // === sẽ luôn false dù cùng giá trị (2 instance khác nhau).
      if (selectedOutbound && result.return) {
        const outboundAirlineId = String(selectedOutbound.airline_id._id);
        result = {
          ...result,
          return: result.return.filter(
            (flight) => String(flight.airline._id) === outboundAirlineId
          ),
        };
      }
    }
  } catch (err) {
    // FlightError (thiếu/sai tham số) -> message đã được service viết sẵn,
    // an toàn hiển thị thẳng. Lỗi khác (DB down...) -> thông báo chung
    // chung, KHÔNG lộ chi tiết kỹ thuật ra trang khách xem.
    errorMessage = err instanceof FlightError ? err.message : tCommon("error");
  }

  // Mang NGUYÊN VẸN ngữ cảnh tìm kiếm (giữ luôn passengerCount dạng chuỗi
  // gốc từ URL, không phải số đã ép kiểu) sang FlightCard -> trang chi tiết
  // (C3) — để biết đang ở lần tìm kiếm nào. outboundFlightId cũng được mang
  // theo sẵn ở đây (undefined nếu chưa có, vô hại) để FlightCard của chặng
  // về tự động chuyển tiếp nó sang trang chi tiết, không cần sửa FlightCard.
  const searchContext = {
    origin,
    destination,
    departureDate,
    tripType,
    returnDate,
    passengerCount: sp.passengerCount,
    outboundFlightId: sp.outboundFlightId,
  };

  return (
    <div className="flex flex-1 flex-col gap-8 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-sea-900">{t("title")}</h1>
        <Link href="/" className="text-sm font-medium text-sea-700 hover:underline">
          {t("backToSearch")}
        </Link>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      {result && (
        <>
          {isReturnStep && selectedOutbound && (
            <div className="rounded-xl border border-sea-700/20 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sea-700">
                {t("selectedOutboundLabel")}
              </p>
              <p className="mt-1 text-sm text-ink">
                {selectedOutbound.origin_code} → {selectedOutbound.dest_code} ·{" "}
                {toVN(selectedOutbound.departure_time).format("HH:mm DD/MM")} ·{" "}
                {CURRENCY_FORMATTER.format(selectedOutbound.base_price.economy)}đ
              </p>
              <p className="mt-1 text-xs text-ink/60">
                {t("sameAirlineNote", {
                  airline: selectedOutbound.airline_id.name[locale] ?? selectedOutbound.airline_id.name.vi,
                })}
              </p>
            </div>
          )}

          {!isReturnStep && (
            <section className="flex flex-col gap-3">
              {tripType === "round_trip" && (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
                  {t("stepOutboundTitle")}
                </h2>
              )}
              {result.outbound.length === 0 ? (
                <p className="text-sm text-ink/60">{t("noResults")}</p>
              ) : (
                result.outbound.map((flight) => (
                  <FlightCard
                    key={String(flight._id)}
                    flight={flight}
                    locale={locale}
                    leg="outbound"
                    searchContext={searchContext}
                    t={t}
                  />
                ))
              )}
            </section>
          )}

          {tripType === "round_trip" && isReturnStep && (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/60">
                {t("stepReturnTitle")}
              </h2>
              {result.return.length === 0 ? (
                <p className="text-sm text-ink/60">{t("noResults")}</p>
              ) : (
                result.return.map((flight) => (
                  <FlightCard
                    key={String(flight._id)}
                    flight={flight}
                    locale={locale}
                    leg="return"
                    searchContext={searchContext}
                    t={t}
                  />
                ))
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
