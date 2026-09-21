// app/[locale]/my-bookings/page.js
//
// C9 — lịch sử đặt vé. Server Component gọi THẲNG Mongoose (cùng lý do các
// trang khác đã ghi chú: tiết kiệm 1 round-trip vì đã chạy server-side sẵn)
// thay vì fetch GET /api/bookings/my của chính mình. Route đó vẫn giữ lại
// cho các nơi gọi khác (VD gọi lại sau khi hủy vé từ Client Component).
//
// Route nằm trong PROTECTED_SEGMENTS (proxy.js) nên auth() ở đây LUÔN có
// session hợp lệ — không cần tự redirect (giống app/[locale]/booking/*).

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import Booking from "@/models/Booking";
import BookingList from "./BookingList";

export default async function MyBookingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("MyBookings");

  const session = await auth();

  await dbConnect();
  const bookings = await Booking.find({ user_id: session.user.id })
    .sort({ created_at: -1 })
    .populate({
      path: "flights.flight_id",
      select: "flight_number origin_code dest_code departure_time arrival_time",
    });

  // toJSON() của Mongoose Document tự lo ObjectId -> string, Date -> ISO —
  // an toàn để truyền thẳng qua Client Component (không có field nhạy cảm
  // nào ở đây khác user, và đây LÀ user đang xem chính booking của họ).
  const plainBookings = JSON.parse(JSON.stringify(bookings));

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="font-display text-2xl font-semibold text-sea-900">{t("title")}</h1>
      </div>
      <BookingList initialBookings={plainBookings} locale={locale} />
    </div>
  );
}
