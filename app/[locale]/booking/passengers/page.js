// app/[locale]/booking/passengers/page.js
//
// C4+C5 — nhập hành khách + chọn ghế TRÊN CÙNG 1 màn hình (đúng đặc tả C4:
// "Diễn ra cùng màn hình với C5 — không phải 2 bước tách rời hoàn toàn").
// File này CHỈ lo phần Server Component (đăng nhập, nạp Flight kèm seats[]
// đầy đủ) — toàn bộ tương tác (hold/release ghế, thêm/xóa hành khách, submit
// booking + thanh toán) nằm ở PassengersForm.jsx (Client Component).
//
// Route nằm trong PROTECTED_SEGMENTS (proxy.js) nên `auth()` ở đây LUÔN có
// session hợp lệ (JWT) — không cần tự redirect. Vẫn KHÔNG được coi session
// này là đủ để tạo booking/giữ ghế thật: mọi API hold-seat/bookings/payments
// đều tự gọi lại requireActiveUser() để đọc is_blocked TRỰC TIẾP từ DB
// (ghi chú q) — session ở đây chỉ dùng để hiển thị UI (preferred_language,
// user id để tô màu ghế "bạn đang giữ").

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { getFlightDetail, FlightError } from "@/services/flightService";
import { Link } from "@/i18n/navigation";
import PassengersForm from "./PassengersForm";

/**
 * Mongoose doc -> plain JSON an toàn để truyền qua Client Component.
 *
 * QUAN TRỌNG (không chỉ là ép kiểu): Flight.seats[].held_by là ObjectId của
 * NGƯỜI DÙNG KHÁC (bất kỳ khách nào đang giữ ghế đó) — nếu đưa thẳng
 * JSON.parse(JSON.stringify(flight)) ra client component, giá trị này lọt
 * vào RSC payload gửi qua trình duyệt, tức là MỌI khách đang xem trang này
 * đều đọc được id tài khoản của người khác đang giữ ghế nào. Thay vì gửi
 * held_by thô, chỉ gửi held_by_me (boolean, so sánh SẴN Ở SERVER) — vừa đủ
 * để PassengersForm biết "ghế này mình đang giữ từ trước" mà không lộ danh
 * tính người khác. checked_in/checked_in_at/boarding_pass_code cũng bỏ hẳn —
 * không liên quan gì tới màn hình đặt vé (chỉ dùng ở C10 check-in).
 */
function toPlainFlight(doc, currentUserId) {
  const plain = JSON.parse(JSON.stringify(doc));
  return {
    ...plain,
    seats: plain.seats.map((s) => ({
      seat_number: s.seat_number,
      seat_class: s.seat_class,
      status: s.status,
      held_by_me: s.status === "held" && String(s.held_by) === String(currentUserId),
    })),
  };
}

export default async function BookingPassengersPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("BookingSummary"); // tái dùng message lỗi tham số/chuyến bay
  const tCommon = await getTranslations("Common");

  const session = await auth();
  const sp = await searchParams;
  const tripType = sp.tripType === "round_trip" ? "round_trip" : "one_way";
  const passengerCount = Math.max(1, Number(sp.passengerCount) || 1);
  const outboundFlightId = sp.outboundFlightId;
  const returnFlightId = sp.returnFlightId;

  if (!outboundFlightId || (tripType === "round_trip" && !returnFlightId)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{t("errorMissingParams")}</p>
        <Link href="/" className="text-sm font-medium text-sea-500 hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  await dbConnect();

  let outbound = null;
  let returnFlight = null;
  let errorMessage = null;
  try {
    outbound = await getFlightDetail(outboundFlightId);
    if (tripType === "round_trip") {
      returnFlight = await getFlightDetail(returnFlightId);
    }
  } catch (err) {
    // Log lỗi THẬT ra terminal trước — không có dòng này, mọi lỗi không
    // phải FlightError bị nuốt hoàn toàn, không cách nào debug được.
    console.error("BookingFlowPage error:", err);
    errorMessage = err instanceof FlightError ? t("errorNotFound") : tCommon("error");
  }

  if (errorMessage || !outbound) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-sand-50 px-4 py-24 text-center">
        <p className="text-danger">{errorMessage ?? t("errorNotFound")}</p>
        <Link href="/" className="text-sm font-medium text-sea-500 hover:underline">
          {tCommon("back")}
        </Link>
      </div>
    );
  }

  return (
    <PassengersForm
      locale={locale}
      tripType={tripType}
      initialPassengerCount={passengerCount}
      outboundFlight={toPlainFlight(outbound, session.user.id)}
      returnFlight={returnFlight ? toPlainFlight(returnFlight, session.user.id) : null}
    />
  );
}
