// app/[locale]/my-bookings/[id]/ticket/page.js
//
// C7 — xem lại vé điện tử. Nằm trong PROTECTED_SEGMENTS qua tiền tố
// "my-bookings" (proxy.js: `(my-bookings)(/.*)?`) nên auth() ở đây LUÔN có
// session hợp lệ, giống các trang booking/* khác.
//
// Gọi THẲNG issueTicket() thay vì fetch GET /api/bookings/[id]/ticket của
// chính mình (đã server-side sẵn, tiết kiệm 1 round-trip — cùng lý do các
// trang khác trong app/[locale] đã áp dụng). Route API vẫn giữ lại cho nút
// "Gửi lại qua email" (ResendButton — Client Component, PHẢI gọi qua fetch
// vì là hành động sau khi trang đã tải xong).

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import Booking from "@/models/Booking";
import { issueTicket, TicketError } from "@/services/ticketService";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import { toVN } from "@/lib/timezone";
import ResendButton from "./ResendButton";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

const DOCUMENT_TYPE_KEY = {
  cccd: "documentTypeCccd",
  passport: "documentTypePassport",
  birth_certificate: "documentTypeBirthCertificate",
};

export default async function TicketPage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Ticket");
  const tBooking = await getTranslations("Booking"); // tái dùng nhãn document_type đã dịch sẵn
  const tFlightDetail = await getTranslations("FlightDetail"); // tái dùng economyLabel/businessLabel

  const session = await auth();

  await dbConnect();
  const booking = await Booking.findById(id).catch(() => null);

  if (!booking) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{t("notFound")}</p>
        <Link href="/my-bookings" className="text-sm font-medium text-sea-500 hover:underline">
          {t("backToMyBookings")}
        </Link>
      </div>
    );
  }

  // KHÔNG dùng notFound() (404) cho trường hợp không đúng chủ — dễ khiến
  // khách tưởng nhầm link, trong khi bản chất là vấn đề quyền hạn. Hiện
  // thông báo riêng, cùng cách app/[locale]/payment/page.js đã làm.
  if (String(booking.user_id) !== String(session.user.id)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{t("notOwner")}</p>
        <Link href="/my-bookings" className="text-sm font-medium text-sea-500 hover:underline">
          {t("backToMyBookings")}
        </Link>
      </div>
    );
  }

  let ticketData = null;
  let errorMessage = null;
  try {
    ({ ticketData } = await issueTicket({ bookingId: id }));
  } catch (err) {
    // Log lỗi THẬT ra terminal — không có dòng này thì mọi lỗi không phải
    // TicketError bị nuốt hoàn toàn, chỉ còn message chung chung hiện cho
    // khách, không cách nào biết nguyên nhân thật để debug.
    console.error("TicketPage error:", err);
    errorMessage = err instanceof TicketError ? err.message : t("genericError");
  }

  if (errorMessage || !ticketData) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{errorMessage}</p>
        <Link href="/my-bookings" className="text-sm font-medium text-sea-500 hover:underline">
          {t("backToMyBookings")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-2xl">
        <Link href="/my-bookings" className="text-sm font-medium text-sea-700 hover:underline">
          ← {t("backToMyBookings")}
        </Link>
      </div>

      <Card className="w-full max-w-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">
              {t("bookingCodeLabel")}
            </p>
            <p className="font-mono text-2xl font-bold tracking-widest text-sea-900">
              {ticketData.booking_code}
            </p>
          </div>
          <ResendButton bookingId={ticketData.booking_id} />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          {ticketData.legs.map((leg) => {
            const departure = toVN(leg.departure_time);
            const arrival = toVN(leg.arrival_time);
            return (
              <div key={leg.leg} className="rounded-lg bg-white/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sea-700">
                  {leg.leg === "outbound" ? t("outboundLabel") : t("returnLabel")}
                </p>
                <p className="mt-1 text-sm font-medium text-ink">{leg.flight_number}</p>
                <p className="mt-1 text-sm text-ink/70">
                  {leg.origin_code} {departure.format("HH:mm")} → {leg.dest_code}{" "}
                  {arrival.format("HH:mm")} · {departure.format("DD/MM/YYYY")}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 border-t border-sand-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">
            {t("passengersTitle")}
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {ticketData.passengers.map((p, i) => (
              <div key={i} className="text-sm">
                <p className="font-medium text-ink">
                  {p.full_name}{" "}
                  <span className="font-normal text-ink/50">
                    ({tBooking(DOCUMENT_TYPE_KEY[p.document_type])}
                    {p.document_id ? ` · ${p.document_id}` : ""})
                  </span>
                </p>
                {/* Không gán được TÊN CHẶNG cho từng ghế ở đây — ticketData.legs
                    không mang flight_id (chỉ có ở ticketData.passengers[].seats[]),
                    xem services/ticketService.buildTicketData(). Liệt kê phẳng
                    số ghế + hạng ghế là đủ cho 1 vé điện tử, không bắt buộc phải
                    gắn đúng chặng ở màn hình này. */}
                <p className="text-ink/60">
                  {p.seats
                    .map(
                      (s) =>
                        `${s.seat_number} (${
                          s.seat_class === "business"
                            ? tFlightDetail("businessLabel")
                            : tFlightDetail("economyLabel")
                        })`
                    )
                    .join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-sand-100 pt-4">
          <span className="font-medium text-ink">{t("totalAmountLabel")}</span>
          <span className="font-semibold text-coral-600">
            {CURRENCY_FORMATTER.format(ticketData.total_amount)}đ
          </span>
        </div>
      </Card>
    </div>
  );
}
