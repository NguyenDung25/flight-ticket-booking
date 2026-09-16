// components/ui/StatusBadge.jsx
//
// Server Component thuần. Cố tình KHÔNG tự gọi useTranslations ở đây để
// không ép nơi gọi phải là Client Component — nơi gọi tự lấy label đã dịch
// (từ namespace MyBookings.status*) và truyền vào, component này chỉ lo
// màu sắc theo đúng 5 giá trị enum thật của Booking.status
// (models/Booking.js) — KHÔNG thêm trạng thái nào ngoài danh sách đó.

const TONE_CLASSES = {
  pending_payment: "bg-warning/10 text-warning border-warning/30",
  confirmed: "bg-success/10 text-success border-success/30",
  cancelled: "bg-ink/5 text-ink/50 border-ink/15",
  refunded: "bg-sea-500/10 text-sea-700 border-sea-500/30",
  payment_error_manual_refund: "bg-danger/10 text-danger border-danger/30",
};

export default function StatusBadge({ status, label }) {
  const toneClass = TONE_CLASSES[status] ?? TONE_CLASSES.pending_payment;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
    >
      {label}
    </span>
  );
}
