// app/[locale]/payment/page.js
//
// C6 — khách được Momo redirect VỀ ĐÂY sau khi thanh toán xong (redirectUrl
// build trong services/paymentService.initiatePayment). Trang này KHÔNG tự
// đổi trạng thái booking gì cả — đó là việc CỦA WEBHOOK (POST
// /api/payments/[bookingId], có thể tới TRƯỚC hoặc SAU khi khách được
// redirect về đây, 2 việc chạy song song độc lập). Trang chỉ đọc trạng thái
// HIỆN TẠI và hiển thị — nếu webhook chưa kịp xử lý xong, khuyên khách tải
// lại trang sau vài giây (xem message Payment.statusPendingPayment).
//
// Route nằm trong PROTECTED_SEGMENTS (proxy.js) — bắt buộc đăng nhập, và ở
// đây còn đối chiếu thêm booking.user_id đúng người đang xem (không cho xem
// booking của người khác chỉ bằng cách đổi bookingId trên URL).

import { getTranslations, setRequestLocale } from "next-intl/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import Booking from "@/models/Booking";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";

const STATUS_MESSAGE_KEY = {
  pending_payment: "statusPendingPayment",
  confirmed: "statusConfirmed",
  cancelled: "statusCancelled",
  payment_error_manual_refund: "statusPaymentError",
  refunded: "statusCancelled",
};

const STATUS_TONE = {
  confirmed: "text-sea-700",
  pending_payment: "text-ink",
  cancelled: "text-danger",
  payment_error_manual_refund: "text-danger",
  refunded: "text-ink",
};

export default async function PaymentResultPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Payment");

  const session = await auth();
  const sp = await searchParams;
  const bookingId = sp.bookingId;

  await dbConnect();

  let booking = null;
  if (bookingId) {
    booking = await Booking.findById(bookingId).catch(() => null);
    // Không cho xem booking của người khác — coi như "không tìm thấy",
    // KHÔNG phân biệt "không tồn tại" vs "không phải của bạn" (tránh lộ
    // thông tin booking đó CÓ tồn tại hay không cho người không sở hữu).
    if (booking && String(booking.user_id) !== String(session.user.id)) {
      booking = null;
    }
  }

  const statusKey = booking ? STATUS_MESSAGE_KEY[booking.status] ?? "statusNotFound" : "statusNotFound";
  const tone = booking ? STATUS_TONE[booking.status] ?? "text-ink" : "text-danger";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-sand-50 px-4 py-24 text-center">
      <Card className="w-full max-w-md p-8">
        <h1 className="font-display text-xl font-semibold text-sea-900">{t("title")}</h1>
        <p className={`mt-4 text-sm ${tone}`}>{t(statusKey)}</p>

        {booking && (
          <p className="mt-2 text-xs text-ink/50">
            {booking.booking_code ? `${t("title")}: ${booking.booking_code}` : bookingId}
          </p>
        )}

        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600"
        >
          {t("backToHome")}
        </Link>
      </Card>
    </div>
  );
}
