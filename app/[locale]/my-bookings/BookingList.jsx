"use client";

// app/[locale]/my-bookings/BookingList.jsx
//
// C9 — hiển thị danh sách vé + nút hủy. Xác nhận 2 bước ngay trên thẻ (bấm
// "Hủy vé" -> hiện "Xác nhận hủy?" + 2 nút Có/Không) thay vì window.confirm()
// để giữ đúng phong cách UI của app (Modal/dialog riêng CHƯA có trong
// components/ui, không tự chế thêm 1 component mới chỉ cho 1 chỗ dùng).
//
// Sau khi hủy thành công, THAY THẾ NGUYÊN booking đó bằng bản trả về từ
// API (đã có đủ refund_amount/cancellation_fee_amount/status mới) — không tự
// suy đoán các field đó ở client, vì công thức tính nằm hoàn toàn ở
// services/cancellationService.js (mốc 24h/3h, 3 trường hợp khứ hồi...).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import { toVN } from "@/lib/timezone";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

const STATUS_LABEL_KEY = {
  pending_payment: "statusPendingPayment",
  confirmed: "statusConfirmed",
  cancelled: "statusCancelled",
  refunded: "statusRefunded",
  payment_error_manual_refund: "statusPaymentErrorManualRefund",
};

// Chỉ cho THỬ hủy ở 2 trạng thái này — mọi rule chi tiết hơn (đã check-in,
// hành trình đã hoàn tất...) do chính API /cancel đối chiếu lại và trả lỗi
// rõ ràng, nút bấm ở đây chỉ lọc bớt trường hợp CHẮC CHẮN không hủy được
// (VD đã 'refunded' hoặc 'cancelled' từ trước) để đỡ 1 lượt gọi API vô ích.
const CANCELLABLE_STATUSES = new Set(["pending_payment", "confirmed"]);

function legLabel(flightId) {
  // flights.flight_id có thể chưa populate được (chuyến bay đã bị admin xóa
  // hẳn khỏi DB — hiếm nhưng không phải không thể) -> flight_id lúc đó vẫn
  // là 1 chuỗi ObjectId thay vì object đã populate.
  if (!flightId || typeof flightId === "string") return null;
  return flightId;
}

function FlightLegRow({ leg, label, t }) {
  const flight = legLabel(leg.flight_id);
  if (!flight) {
    return (
      <p className="text-xs text-ink/40">
        {label}: {t("flightUnavailable")}
      </p>
    );
  }
  const departure = toVN(flight.departure_time);
  return (
    <p className="text-sm text-ink/70">
      {label}: {flight.origin_code} → {flight.dest_code} · {departure.format("HH:mm DD/MM/YYYY")}
    </p>
  );
}

function BookingCard({ booking, onCancelled, t, tCommon }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  const outboundLeg = booking.flights.find((f) => f.leg === "outbound");
  const returnLeg = booking.flights.find((f) => f.leg === "return");

  async function handleConfirmCancel() {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${booking._id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || t("cancelError"));
      }
      onCancelled(data);
      setConfirming(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-ink/50">
            {t("bookingCodeLabel")}:{" "}
            <span className="font-medium text-ink">{booking.booking_code ?? t("noBookingCode")}</span>
          </p>
          <p className="mt-1 text-xs text-ink/50">
            {t("passengerCountLabel")}: {booking.passengers.length}
          </p>
        </div>
        <StatusBadge status={booking.status} label={t(STATUS_LABEL_KEY[booking.status] ?? "statusPendingPayment")} />
      </div>

      {booking.status === "confirmed" && (
        <Link
          href={`/my-bookings/${booking._id}/ticket`}
          className="mt-2 inline-block text-xs font-medium text-sea-500 hover:underline"
        >
          {t("viewTicket")}
        </Link>
      )}

      <div className="mt-3 flex flex-col gap-1">
        {outboundLeg && <FlightLegRow leg={outboundLeg} label={t("outboundLabel")} t={t} />}
        {returnLeg && <FlightLegRow leg={returnLeg} label={t("returnLabel")} t={t} />}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 pt-3">
        <div>
          <p className="text-xs text-ink/60">{t("totalAmountLabel")}</p>
          <p className="text-base font-semibold text-ink">
            {CURRENCY_FORMATTER.format(booking.total_amount)}đ
          </p>
          {booking.status === "refunded" && booking.refund_amount != null && (
            <p className="mt-1 text-xs text-sea-700">
              {t("refundAmountLabel")}: {CURRENCY_FORMATTER.format(booking.refund_amount)}đ
            </p>
          )}
        </div>

        {CANCELLABLE_STATUSES.has(booking.status) && (
          <div className="flex flex-col items-end gap-2">
            {!confirming ? (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                {t("cancelBooking")}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink/70">{t("confirmCancelPrompt")}</span>
                <Button
                  variant="primary"
                  onClick={handleConfirmCancel}
                  disabled={cancelling}
                  className="bg-danger! hover:bg-danger/90!"
                >
                  {cancelling ? t("cancelling") : tCommon("confirm")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={cancelling}>
                  {tCommon("cancel")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}

export default function BookingList({ initialBookings }) {
  const t = useTranslations("MyBookings");
  const tCommon = useTranslations("Common");
  const [bookings, setBookings] = useState(initialBookings);

  function handleCancelled(updatedBooking) {
    setBookings((prev) =>
      prev.map((b) => (b._id === updatedBooking._id ? updatedBooking : b))
    );
  }

  if (bookings.length === 0) {
    return <p className="text-sm text-ink/60">{t("noBookings")}</p>;
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {bookings.map((booking) => (
        <BookingCard
          key={booking._id}
          booking={booking}
          onCancelled={handleCancelled}
          t={t}
          tCommon={tCommon}
        />
      ))}
    </div>
  );
}
