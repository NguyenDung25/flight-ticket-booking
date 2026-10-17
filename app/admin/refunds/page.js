import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import Booking from "@/models/Booking";
import StatusBadge from "@/components/ui/StatusBadge";
// Side-effect import cho populate("user_id").
import "@/models/User";

export const metadata = {
  title: "Nhật ký hoàn tiền — Quản trị",
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

const TIER_LABELS = {
  full: "Hoàn toàn phần",
  partial: "Hoàn 1 phần",
  none: "Không hoàn (phạt 100%)",
};

const STATUS_LABELS = {
  refunded: "Đã hoàn tiền",
  payment_error_manual_refund: "Lỗi — cần hoàn tay",
};

export default async function AdminRefundsPage() {
  await guardAdminPage();
  await dbConnect();
  const bookingDocs = await Booking.find(
    { status: { $in: ["refunded", "payment_error_manual_refund"] } },
    "-passengers.document_id"
  )
    .populate("user_id", "email full_name")
    .sort({ refund_processed_at: -1, created_at: -1 })
    .limit(200)
    .lean();

  const refunds = bookingDocs.map((b) => ({
    id: String(b._id),
    booking_code: b.booking_code,
    customerEmail: b.user_id?.email ?? "(đã xóa tài khoản)",
    customerName: b.user_id?.full_name ?? "—",
    status: b.status,
    total_amount: b.total_amount,
    refund_amount: b.refund_amount,
    cancellation_fee_amount: b.cancellation_fee_amount,
    cancellation_tier: b.cancellation_tier,
    cancel_reason: b.cancel_reason,
    refund_processed_at: b.refund_processed_at
      ? new Date(b.refund_processed_at).toISOString()
      : null,
  }));

  // Booking bị khách thanh toán 2 lần (payment.extra_payments) — cần hoàn khoản thừa bên VNPay.
  const dupDocs = await Booking.find(
    { "payment.extra_payments.0": { $exists: true } },
    "booking_code user_id total_amount payment.extra_payments"
  )
    .populate("user_id", "email full_name")
    .limit(200)
    .lean();
  const duplicates = dupDocs.flatMap((b) =>
    b.payment.extra_payments.map((e) => ({
      key: `${b._id}-${e.trans_id}`,
      booking_code: b.booking_code,
      email: b.user_id?.email ?? "(đã xóa tài khoản)",
      trans_id: e.trans_id,
      amount: e.amount,
      received_at: e.received_at ? new Date(e.received_at).toISOString() : null,
    }))
  );

  const manualErrorCount = refunds.filter((r) => r.status === "payment_error_manual_refund").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Nhật ký hoàn tiền</h1>
        <p className="text-sm text-ink/60">
          {refunds.length} booking đã hoàn tiền / lỗi hoàn tiền
          {manualErrorCount > 0 && (
            <span className="ml-2 font-medium text-danger">
              — {manualErrorCount} case cần xử lý hoàn tiền THỦ CÔNG (thao tác tại mục Booking)
            </span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Mã vé</th>
              <th className="px-4 py-3">Khách hàng</th>
              <th className="px-4 py-3">Tổng tiền vé</th>
              <th className="px-4 py-3">Phí phạt</th>
              <th className="px-4 py-3">Đã hoàn</th>
              <th className="px-4 py-3">Mức hoàn</th>
              <th className="px-4 py-3">Lý do hủy</th>
              <th className="px-4 py-3">Thời điểm</th>
              <th className="px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-b border-sand-100 last:border-0 align-top">
                <td className="px-4 py-3 font-mono text-xs">
                  {r.booking_code ?? <span className="text-ink/40">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div>{r.customerName}</div>
                  <div className="text-xs text-ink/60">{r.customerEmail}</div>
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {CURRENCY_FORMATTER.format(r.total_amount)}đ
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {r.cancellation_fee_amount != null
                    ? `${CURRENCY_FORMATTER.format(r.cancellation_fee_amount)}đ`
                    : "—"}
                </td>
                <td className="px-4 py-3 font-medium text-sea-700">
                  {r.refund_amount != null ? `${CURRENCY_FORMATTER.format(r.refund_amount)}đ` : "—"}
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {TIER_LABELS[r.cancellation_tier] ?? "—"}
                </td>
                <td className="px-4 py-3 max-w-[220px] text-xs text-ink/60">
                  {r.cancel_reason ?? "—"}
                </td>
                <td className="px-4 py-3 text-ink/60">
                  {r.refund_processed_at
                    ? new Date(r.refund_processed_at).toLocaleString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} label={STATUS_LABELS[r.status] ?? r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {refunds.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink/50">Chưa có booking nào được hoàn tiền.</p>
        )}
      </div>

      {duplicates.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-white p-4">
          <h2 className="font-medium text-danger">
            {duplicates.length} khoản thanh toán TRÙNG cần hoàn tay trên VNPay
          </h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase text-ink/60">
              <tr>
                <th className="py-2 pr-4">Mã vé</th>
                <th className="py-2 pr-4">Khách hàng</th>
                <th className="py-2 pr-4">Mã giao dịch thừa</th>
                <th className="py-2 pr-4">Số tiền</th>
                <th className="py-2">Thời điểm</th>
              </tr>
            </thead>
            <tbody>
              {duplicates.map((d) => (
                <tr key={d.key} className="border-t border-sand-100">
                  <td className="py-2 pr-4 font-mono text-xs">{d.booking_code ?? "—"}</td>
                  <td className="py-2 pr-4">{d.email}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{d.trans_id}</td>
                  <td className="py-2 pr-4">{CURRENCY_FORMATTER.format(d.amount ?? 0)}đ</td>
                  <td className="py-2 text-ink/60">
                    {d.received_at
                      ? new Date(d.received_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
