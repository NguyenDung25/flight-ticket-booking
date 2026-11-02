import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import Booking from "@/models/Booking";
import StatusBadge from "@/components/ui/StatusBadge";
import CancelBookingButton from "./CancelBookingButton";
import ManualRefundButton from "./ManualRefundButton";
// Side-effect import — populate("user_id") cần model User đã được nạp.
import User from "@/models/User";
import "@/models/Flight";

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

const LIST_LIMIT = 200;

export default async function AdminBookingsPage({ searchParams }) {
  await guardAdminPage();
  await dbConnect();
  const sp = await searchParams;
  const clean = (v) => (typeof v === "string" ? v : "").trim().slice(0, 100);
  const code = clean(sp.code);
  const email = clean(sp.email);
  const searching = Boolean(code || email);

  // Có từ khóa: tìm đúng mã vé và/hoặc email khách (kể cả đơn cũ nằm ngoài 200 đơn mới nhất).
  const filter = {};
  if (code) filter.booking_code = code.toUpperCase();
  if (email) {
    const users = await User.find({ email: email.toLowerCase() }, "_id").lean();
    filter.user_id = { $in: users.map((u) => u._id) };
  }
  const populateFind = (f) =>
    Booking.find(f, "-passengers.document_id")
      .populate("user_id", "email full_name")
      .populate("flights.flight_id", "departure_time")
      .sort({ created_at: -1 });

  // Đơn "cần hoàn tay" luôn hiện dù cũ đến đâu, nếu không admin không còn chỗ để hoàn tiền cho khách.
  const [recent, pinned] = await Promise.all([
    populateFind(filter).limit(LIST_LIMIT).lean(),
    searching ? [] : populateFind({ status: "payment_error_manual_refund" }).lean(),
  ]);
  const seen = new Set(recent.map((b) => String(b._id)));
  const bookingDocs = [...recent, ...pinned.filter((b) => !seen.has(String(b._id)))].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const now = new Date();
  // Map về mảng thuần trước khi truyền cho Client Component (CancelBookingButton) — _id/user_id._id là ObjectId.
  const bookings = bookingDocs.map((b) => ({
    id: String(b._id),
    booking_code: b.booking_code,
    customerEmail: b.user_id?.email ?? "(đã xóa tài khoản)",
    customerName: b.user_id?.full_name ?? "—",
    contact: b.contact ? `${b.contact.email} · ${b.contact.phone}` : null,
    trip_type: b.trip_type,
    passengerCount: b.passengers?.length ?? 0,
    total_amount: b.total_amount,
    status: b.status,
    // Đã bay hết các chặng thì không còn gì để hủy (server cũng chặn) — ẩn nút "Hủy vé".
    tripCompleted:
      b.status === "confirmed" &&
      b.flights.length > 0 &&
      b.flights.every((f) => f.flight_id?.departure_time && new Date(f.flight_id.departure_time) <= now),
    created_at: b.created_at ? new Date(b.created_at).toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Booking</h1>
        <p className="text-sm text-ink/60">
          {searching ? `${bookings.length} booking khớp kết quả tìm` : `${bookings.length} booking gần nhất`}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {/* Hai form riêng: mỗi ô có nút Tìm riêng, tìm theo đúng một tiêu chí. */}
          <form method="get" className="flex gap-2">
            <input
              name="code"
              defaultValue={code}
              placeholder="Tìm mã vé"
              aria-label="Tìm booking theo mã vé"
              className="w-48 rounded-lg border border-sand-100 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
            />
            <button type="submit" className="rounded-lg bg-coral-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-coral-600">
              Tìm
            </button>
          </form>
          <form method="get" className="flex gap-2">
            <input
              name="email"
              defaultValue={email}
              placeholder="Tìm email khách"
              aria-label="Tìm booking theo email khách"
              className="w-64 rounded-lg border border-sand-100 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
            />
            <button type="submit" className="rounded-lg bg-coral-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-coral-600">
              Tìm
            </button>
          </form>
          {searching && (
            <Link href="/admin/bookings" className="self-center text-sm font-semibold text-coral-600 underline">
              Xem tất cả
            </Link>
          )}
        </div>
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
                  {b.contact && <div className="text-xs text-ink/60">Liên hệ: {b.contact}</div>}
                </td>
                <td className="px-4 py-3">
                  {b.trip_type === "round_trip" ? "Khứ hồi" : "Một chiều"}
                </td>
                <td className="px-4 py-3">{b.passengerCount}</td>
                <td className="px-4 py-3">{CURRENCY_FORMATTER.format(b.total_amount)}đ</td>
                <td className="px-4 py-3 text-ink/60">
                  {/* timeZone tường minh — .toLocaleString mặc định theo múi giờ máy chủ, không phải giờ VN. */}
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
                  {!b.tripCompleted && <CancelBookingButton bookingId={b.id} status={b.status} />}
                  {/* Chỉ hiện với đơn "lỗi thanh toán — cần xử lý tay" (khách đã bị trừ tiền nhưng đơn đã hủy). */}
                  <ManualRefundButton bookingId={b.id} status={b.status} totalAmount={b.total_amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink/50">{searching ? "Không tìm thấy booking nào." : "Chưa có booking nào."}</p>
        )}
      </div>
    </div>
  );
}
