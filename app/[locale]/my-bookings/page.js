import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardActivePage } from "@/lib/guardActivePage";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import Booking from "@/models/Booking";
// Side-effect import — populate({path:"flights.flight_id"}) bên dưới cần model "Flight" đã được đăng ký.
import "@/models/Flight";
import BookingList from "./BookingList";

export default async function MyBookingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("MyBookings");

  const session = await auth();
  await guardActivePage(session); // tài khoản bị khóa/xóa -> về /login (JWT cũ vẫn còn hạn)

  await dbConnect();
  const bookings = await Booking.find({ user_id: session.user.id })
    .sort({ created_at: -1 })
    .populate({
      path: "flights.flight_id",
      select: "flight_number origin_code dest_code departure_time arrival_time status",
    });

  // toJSON() của Mongoose Document tự lo ObjectId -> string, Date -> ISO.
  const plainBookings = JSON.parse(JSON.stringify(bookings));

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
      </div>
      <BookingList initialBookings={plainBookings} locale={locale} />
    </div>
  );
}
