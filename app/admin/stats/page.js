// app/admin/stats/page.js
//
// A6 — gọi thẳng statsService (KHÔNG qua /api/admin/stats/revenue), đúng
// convention mọi page.js khác trong khu Admin.
//
// Biểu đồ cột dựng bằng CSS thuần (div + width tính theo %), KHÔNG thêm thư
// viện chart (recharts/chart.js...) — package.json project hiện chưa có sẵn
// thư viện nào, thêm dependency mới chỉ cho 1 biểu đồ đơn giản là không cần
// thiết, đặc biệt với đồ án có deadline cố định (rủi ro cài đặt/build lỗi
// không đáng đánh đổi).

import dbConnect from "@/lib/mongodb";
import { getRevenueByMonth, getRevenueByRoute } from "@/services/statsService";

export const metadata = {
  title: "Thống kê doanh thu — Quản trị",
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

function formatMonthLabel(monthKey) {
  // monthKey dạng "YYYY-MM" (từ $dateToString %Y-%m trong statsService).
  const [year, month] = monthKey.split("-");
  return `Th${Number(month)}/${year}`;
}

export default async function AdminStatsPage() {
  await dbConnect();
  const [byMonth, byRoute] = await Promise.all([getRevenueByMonth(), getRevenueByRoute()]);

  const maxMonthTotal = Math.max(1, ...byMonth.map((m) => m.total_revenue));
  const maxRouteTotal = Math.max(1, ...byRoute.map((r) => r.total_revenue));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Thống kê doanh thu</h1>
        <p className="text-sm text-ink/60">
          Doanh thu = tiền vé đã xác nhận (confirmed) + phí phạt hủy vé thực thu (refunded).
          Phần hoàn lại khách (refund_amount) KHÔNG tính vào đây.
        </p>
      </div>

      {/* Theo tháng */}
      <section className="rounded-xl border border-sand-100 bg-white p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-sea-900">Theo tháng</h2>

        {byMonth.length === 0 ? (
          <p className="text-sm text-ink/50">Chưa có dữ liệu doanh thu.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 text-xs text-ink/60">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sea-500" /> Doanh thu vé
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-coral-500" /> Phí phạt hủy
              </span>
            </div>

            {byMonth.map((m) => {
              const confirmedPct = (m.confirmed_revenue / maxMonthTotal) * 100;
              const penaltyPct = (m.penalty_revenue / maxMonthTotal) * 100;
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-medium text-ink/70">
                    {formatMonthLabel(m.month)}
                  </span>
                  <div className="flex h-6 flex-1 overflow-hidden rounded-md bg-sand-50">
                    <div className="h-full bg-sea-500" style={{ width: `${confirmedPct}%` }} />
                    <div className="h-full bg-coral-500" style={{ width: `${penaltyPct}%` }} />
                  </div>
                  <span className="w-32 shrink-0 text-right text-xs font-semibold text-ink">
                    {CURRENCY_FORMATTER.format(m.total_revenue)}đ
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Theo tuyến */}
      <section className="rounded-xl border border-sand-100 bg-white p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-sea-900">Theo tuyến bay</h2>

        {byRoute.length === 0 ? (
          <p className="text-sm text-ink/50">Chưa có dữ liệu doanh thu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-sand-100 text-xs font-semibold uppercase tracking-wide text-ink/60">
                <tr>
                  <th className="py-2 pr-4">Tuyến</th>
                  <th className="py-2 pr-4">Doanh thu vé</th>
                  <th className="py-2 pr-4">Phí phạt hủy</th>
                  <th className="py-2 pr-4">Tổng</th>
                  <th className="py-2">Tỷ trọng</th>
                </tr>
              </thead>
              <tbody>
                {byRoute.map((r) => (
                  <tr key={`${r.origin}-${r.dest}`} className="border-b border-sand-100 last:border-0">
                    <td className="py-2 pr-4 font-medium text-ink">
                      {r.origin} → {r.dest}
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {CURRENCY_FORMATTER.format(r.confirmed_revenue)}đ
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {CURRENCY_FORMATTER.format(r.penalty_revenue)}đ
                    </td>
                    <td className="py-2 pr-4 font-semibold text-ink">
                      {CURRENCY_FORMATTER.format(r.total_revenue)}đ
                    </td>
                    <td className="py-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-sand-50">
                        <div
                          className="h-full bg-sea-500"
                          style={{ width: `${(r.total_revenue / maxRouteTotal) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
