// app/[locale]/payment/page.js
//
// C6 — khách được VNPay đưa VỀ ĐÂY sau khi thanh toán xong (Return URL build
// trong services/paymentService.initiatePayment, VNPay nối thêm tham số vnp_*).
// Trang KHÔNG tin các tham số vnp_* trên URL — chỉ lấy vnp_TxnRef để biết
// bookingId, rồi để syncPaymentStatus() hỏi thẳng VNPay (querydr) kết quả thật.
// IPN (GET /api/payments/vnpay-ipn) có thể tới TRƯỚC hoặc SAU, 2 luồng chạy
// song song độc lập và đều atomic. Vẫn chưa có kết quả thì khuyên khách tải
// lại trang sau vài giây (xem message Payment.statusPendingPayment).
//
// Route nằm trong PROTECTED_SEGMENTS (proxy.js) — bắt buộc đăng nhập, và ở
// đây còn đối chiếu thêm booking.user_id đúng người đang xem (không cho xem
// booking của người khác chỉ bằng cách đổi bookingId trên URL).

import { getTranslations, setRequestLocale } from "next-intl/server";
import { guardActivePage } from "@/lib/guardActivePage";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import Booking from "@/models/Booking";
import { syncPaymentStatus, parseBookingIdFromOrderId } from "@/services/paymentService";
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
  const tTicket = await getTranslations("Ticket");

  const session = await auth();
  await guardActivePage(session); // tài khoản bị khóa/xóa -> về /login (JWT cũ vẫn còn hạn)
  const sp = await searchParams;
  // ?bookingId=... (link nội bộ) hoặc vnp_TxnRef (VNPay đưa về, 24 ký tự đầu là bookingId).
  const rawId = typeof sp.bookingId === "string" ? sp.bookingId : null;
  const bookingId = rawId ?? parseBookingIdFromOrderId(typeof sp.vnp_TxnRef === "string" ? sp.vnp_TxnRef : "");

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

  // Booking còn pending_payment thì hỏi thẳng VNPay kết quả giao dịch gần nhất (IPN
  // có thể chưa về, hoặc không về được khi chạy local không ngrok). Chỉ chạy SAU khi đã
  // xác nhận booking đúng của người đang xem. Lỗi gì cũng nuốt — trang vẫn hiển thị
  // trạng thái hiện tại. Đọc lại booking sau đó để lấy booking_code mới sinh (C7).
  if (booking?.status === "pending_payment") {
    await syncPaymentStatus(String(booking._id)).catch(() => null);
    booking = await Booking.findById(booking._id).catch(() => booking);
  }

  let statusKey = booking ? STATUS_MESSAGE_KEY[booking.status] ?? "statusNotFound" : "statusNotFound";
  // Chỉ báo "vé đã gửi tới email" khi email THỰC SỰ gửi được (ticket_emailed_at) — SMTP lỗi/chưa cấu
  // hình thì báo thanh toán thành công + hướng dẫn gửi lại từ trang vé.
  if (booking?.status === "confirmed" && !booking.ticket_emailed_at) {
    statusKey = "statusConfirmedEmailPending";
  }
  const tone = booking ? STATUS_TONE[booking.status] ?? "text-ink" : "text-danger";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-sand-50 px-4 py-24 text-center">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className={`mt-4 text-sm ${tone}`}>{t(statusKey)}</p>

        {booking && (
          <p className="mt-2 text-xs text-ink/50">
            {booking.booking_code ? `${tTicket("bookingCodeLabel")}: ${booking.booking_code}` : bookingId}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {/* Chỉ hiện "Xem vé" khi ĐÃ confirmed (mới có booking_code, xem
              services/ticketService.js issueTicket — booking_code sinh lúc
              xem vé lần đầu). "Đặt chỗ của tôi" hiện cho MỌI trạng thái —
              kể cả pending_payment (webhook chưa xử lý xong) hay lỗi, khách
              đều cần 1 đường quay lại xem danh sách vé của mình, không chỉ
              có mỗi "Về trang chủ". */}
          {booking?.status === "confirmed" && (
            <Link
              href={`/my-bookings/${booking._id}/ticket`}
              className="inline-flex items-center justify-center rounded-lg bg-coral-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral-600"
            >
              {t("viewTicket")}
            </Link>
          )}
          {booking && (
            <Link
              href="/my-bookings"
              className="inline-flex items-center justify-center rounded-lg border border-sea-700 px-5 py-2.5 text-sm font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
            >
              {t("myBookings")}
            </Link>
          )}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-ink/60 transition-colors hover:text-ink"
          >
            {t("backToHome")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
