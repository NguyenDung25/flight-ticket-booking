// app/admin/bookings/page.js
//
// A3 — danh sách MỌI booking, admin xem + hủy hộ khách. Gọi thẳng
// Booking.find() (KHÔNG qua /api/admin/bookings) — page.js đã chạy
// server-side sẵn, giống mọi page.js khác trong dự án (xem app/admin/users/page.js).
// Route API vẫn giữ cho phần hủy (cần tương tác client, dùng chung với C9).

import dbConnect from "@/lib/mongodb";
import Booking from "@/models/Booking";
import StatusBadge from "@/components/ui/StatusBadge";
import CancelBookingButton from "./CancelBookingButton";
import ManualRefundButton from "./ManualRefundButton";
// Side-effect import cho populate("user_id") — xem giải thích trong
// app/api/admin/bookings/route.js.
import "@/models/User";

export const metadata = {
  title: "Booking — Quản trị",
};

const STATUS_LABELS = {
  pending_payment: "Chờ thanh toán",
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
  refunded: "Đã hoàn tiền",
  payment_error_manual_refund: "Lỗi thanh toán — cần xử lý tay",
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

export default async function AdminBookingsPage() {
  await dbConnect();
  const bookingDocs = await Booking.find({}, "-passengers.document_id")
    .populate("user_id", "email full_name")
    .sort({ created_at: -1 })
    .limit(200)
    .lean();

  // Map về mảng thuần trước khi truyền cho Client Component (CancelBookingButton)
  // — _id/user_id._id là ObjectId (BSON), không tự serialize qua ranh giới
  // Server -> Client Component.
  const bookings = bookingDocs.map((b) => ({
    id: String(b._id),
    booking_code: b.booking_code,
    customerEmail: b.user_id?.email ?? "(đã xóa tài khoản)",
    customerName: b.user_id?.full_name ?? "—",
    trip_type: b.trip_type,
    passengerCount: b.passengers?.length ?? 0,
    total_amount: b.total_amount,
    status: b.status,
    created_at: b.created_at ? new Date(b.created_at).toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Booking</h1>
        <p className="text-sm text-ink/60">{bookings.length} booking gần nhất</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Mã vé</th>
              <th className="px-4 py-3">Khách hàng</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Số khách</th>
              <th className="px-4 py-3">Tổng tiền</th>
              <th className="px-4 py-3">Ngày đặt</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-sand-100 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">
                  {b.booking_code ?? <span className="text-ink/40">—</span>}
                </td>
                <td className="px-4 py-3">
                  <div>{b.customerName}</div>
                  <div className="text-xs text-ink/60">{b.customerEmail}</div>
                </td>
                <td className="px-4 py-3">
                  {b.trip_type === "round_trip" ? "Khứ hồi" : "Một chiều"}
                </td>
                <td className="px-4 py-3">{b.passengerCount}</td>
                <td className="px-4 py-3">{CURRENCY_FORMATTER.format(b.total_amount)}đ</td>
                <td className="px-4 py-3 text-ink/60">
                  {/* timeZone tường minh — .toLocaleString mặc định theo múi
                      giờ máy chủ, không phải giờ VN (cùng bẫy đã gặp ở
                      scripts/seedSample.js, xem comment ở đó). */}
                  {b.created_at
                    ? new Date(b.created_at).toLocaleString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.status} label={STATUS_LABELS[b.status] ?? b.status} />
                </td>
                <td className="px-4 py-3">
                  <CancelBookingButton bookingId={b.id} status={b.status} />
                  <ManualRefundButton
                    bookingId={b.id}
                    status={b.status}
                    totalAmount={b.total_amount}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
