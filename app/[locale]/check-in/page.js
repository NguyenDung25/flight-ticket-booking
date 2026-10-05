// app/[locale]/check-in/page.js
//
// C10 — thay vì bắt khách tự gõ flight_id/seat_number (dễ gõ sai), trang này
// tự liệt kê MỌI ghế thuộc booking `confirmed` của khách, kèm trạng thái:
// đã check-in (hiện thẻ lên máy bay), đủ điều kiện (hiện nút check-in), hay
// ngoài khung giờ (chỉ hiển thị, không cho bấm) — API vẫn tự đối chiếu lại
// khung giờ khi bấm (services/seatService.checkInSeat), phòng trường hợp
// khách mở trang từ lâu rồi mới bấm, danh sách hiển thị có thể đã cũ.
//
// Cần seats[] ĐẦY ĐỦ của từng Flight (không chỉ vài field như trang
// /my-bookings) để biết checked_in/boarding_pass_code cho TỪNG ghế cụ thể —
// field này KHÔNG nằm trên Booking.passengers[].seats[] (chỉ có
// flight_id/seat_number/seat_class), phải tra ngược sang Flight thật.

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import Booking from "@/models/Booking";
// Side-effect import — populate("passengers.seats.flight_id") (bên dưới)
// cần model "Flight" đã đăng ký. Cùng lớp bug MissingSchemaError đã gặp ở
// services/flightService.js (xem comment đầy đủ ở đó).
import "@/models/Flight";
import { isCheckInWindowOpen } from "@/lib/timezone";
import CheckInList from "./CheckInList";

/**
 * Từ danh sách booking `confirmed` (đã populate flights.flight_id kèm
 * seats[]) -> danh sách phẳng 1 dòng / 1 ghế, kèm trạng thái hiển thị.
 */
function buildCheckInItems(bookings) {
  const items = [];

  for (const booking of bookings) {
    for (const passenger of booking.passengers) {
      for (const seatRef of passenger.seats) {
        const flight = seatRef.flight_id; // đã populate — object Flight đầy đủ
        if (!flight || typeof flight === "string") continue; // chuyến bay đã bị xóa hẳn

        const seatDoc = flight.seats.find((s) => s.seat_number === seatRef.seat_number);
        if (!seatDoc) continue;

        const windowOpen = isCheckInWindowOpen(flight.departure_time);
        items.push({
          bookingId: String(booking._id),
          flightId: String(flight._id),
          flightNumber: flight.flight_number,
          originCode: flight.origin_code,
          destCode: flight.dest_code,
          departureTime: flight.departure_time,
          seatNumber: seatRef.seat_number,
          seatClass: seatRef.seat_class,
          passengerName: passenger.full_name,
          checkedIn: seatDoc.checked_in === true,
          checkedInAt: seatDoc.checked_in_at,
          boardingPassCode: seatDoc.boarding_pass_code,
          eligible: windowOpen && !seatDoc.checked_in,
          windowOpen,
        });
      }
    }
  }

  // Sắp theo giờ bay gần nhất trước — hữu ích nhất trước mắt cho khách.
  items.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
  return items;
}

export default async function CheckInPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CheckIn");

  const session = await auth();

  await dbConnect();
  const bookings = await Booking.find({ user_id: session.user.id, status: "confirmed" });

  // buildCheckInItems() chỉ đọc qua passenger.seats[].flight_id (KHÔNG qua
  // booking.flights[] — đó là tóm tắt cấp booking, không có seats[] chi
  // tiết) nên chỉ cần populate ĐÚNG 1 path này, không populate "flights.flight_id"
  // cho tốn thêm 1 lượt truy vấn không dùng tới.
  await Booking.populate(bookings, {
    path: "passengers.seats.flight_id",
    select: "flight_number origin_code dest_code departure_time seats",
  });

  const items = buildCheckInItems(bookings);
  const plainItems = JSON.parse(JSON.stringify(items));

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-sea-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ink/60">{t("windowNote")}</p>
      </div>
      <CheckInList initialItems={plainItems} />
    </div>
  );
}
