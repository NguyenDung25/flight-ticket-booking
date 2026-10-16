// app/admin/logs/page.js
//
// Nhật ký thao tác admin (models/AdminLog.js): ai làm gì, lúc nào, trên đối tượng nào. Chỉ đọc — không
// có nút sửa/xóa. Lọc theo nhóm thao tác qua ?group=..., hiện 200 dòng mới nhất.

import { guardAdminPage } from "@/lib/adminPageGuard";
import dbConnect from "@/lib/mongodb";
import AdminLog from "@/models/AdminLog";
import { toVN } from "@/lib/timezone";

export const metadata = {
  title: "Nhật ký thao tác — Quản trị",
};

const LIMIT = 200;

// Nhóm hiển thị trên thanh lọc -> tiền tố action trong DB.
const GROUPS = [
  { key: "", label: "Tất cả" },
  { key: "booking", label: "Booking / hoàn tiền" },
  { key: "flight", label: "Chuyến bay" },
  { key: "user", label: "Người dùng" },
  { key: "promotion", label: "Khuyến mãi" },
  { key: "aircraft", label: "Máy bay" },
  { key: "airline", label: "Hãng bay" },
  { key: "popular_route", label: "Tuyến phổ biến" },
  { key: "ancillary", label: "Dịch vụ bổ sung" },
];

const ACTION_LABELS = {
  "flight.create": "Tạo chuyến bay",
  "flight.update": "Sửa chuyến bay",
  "flight.delete": "Xóa chuyến bay",
  "flight.cancel_bulk": "Hủy chuyến & xử lý vé",
  "booking.cancel": "Hủy vé thay khách",
  "booking.manual_refund": "Hoàn tiền tay",
  "user.block": "Khóa tài khoản",
  "user.unblock": "Mở khóa tài khoản",
  "user.delete": "Xóa tài khoản",
  "promotion.create": "Tạo mã khuyến mãi",
  "promotion.update": "Sửa mã khuyến mãi",
  "ancillary.update": "Sửa giá hành lý & suất ăn",
  "promotion.delete": "Xóa mã khuyến mãi",
  "aircraft.create": "Thêm máy bay",
  "aircraft.update": "Sửa máy bay",
  "aircraft.delete": "Xóa máy bay",
  "airline.create": "Thêm hãng bay",
  "airline.update": "Sửa hãng bay",
  "airline.delete": "Xóa hãng bay",
  "popular_route.create": "Thêm tuyến phổ biến",
  "popular_route.update": "Sửa tuyến phổ biến",
  "popular_route.delete": "Xóa tuyến phổ biến",
  "popular_route.seed_defaults": "Nạp tuyến mặc định",
  "popular_route.image_update": "Đổi ảnh tuyến",
  "popular_route.image_delete": "Xóa ảnh tuyến",
};

// Thao tác ảnh hưởng tiền/tài khoản khách — tô màu để dễ thấy khi đối soát.
const SENSITIVE = new Set(["booking.cancel", "booking.manual_refund", "user.block", "user.delete", "flight.cancel_bulk"]);

function formatDetails(details) {
  if (!details || typeof details !== "object") return "";
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default async function AdminLogsPage({ searchParams }) {
  await guardAdminPage();
  await dbConnect();

  const { group = "" } = await searchParams;
  const active = GROUPS.find((g) => g.key === group) ?? GROUPS[0];
  const filter = active.key ? { action: { $regex: `^${active.key}\\.` } } : {};
  const logs = await AdminLog.find(filter).sort({ created_at: -1 }).limit(LIMIT).lean();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Nhật ký thao tác</h1>
        <p className="text-sm text-ink/60">
          Ghi lại mọi thao tác thay đổi dữ liệu của quản trị viên (chỉ đọc). Hiện {logs.length} dòng mới nhất
          {logs.length === LIMIT ? ` (giới hạn ${LIMIT})` : ""}.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 text-xs">
        {GROUPS.map((g) => (
          <a
            key={g.key || "all"}
            href={g.key ? `/admin/logs?group=${g.key}` : "/admin/logs"}
            className={`rounded-lg border px-3 py-1.5 font-medium ${
              g.key === active.key
                ? "border-sea-700 bg-sea-700 text-white"
                : "border-sand-100 bg-white text-ink/70 hover:border-sea-700"
            }`}
          >
            {g.label}
          </a>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Thời điểm</th>
              <th className="px-4 py-3">Quản trị viên</th>
              <th className="px-4 py-3">Thao tác</th>
              <th className="px-4 py-3">Nội dung</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/50">
                  Chưa có thao tác nào được ghi lại.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={String(log._id)} className="border-b border-sand-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-ink/60">
                  {toVN(log.created_at).format("HH:mm:ss DD/MM/YYYY")}
                </td>
                <td className="px-4 py-3">{log.admin_email}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      SENSITIVE.has(log.action) ? "bg-danger/10 text-danger" : "bg-sand-50 text-ink/70"
                    }`}
                  >
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-ink">{log.summary}</div>
                  {formatDetails(log.details) && (
                    <div className="mt-0.5 text-xs text-ink/50">{formatDetails(log.details)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
