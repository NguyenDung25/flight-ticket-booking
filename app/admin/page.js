import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import { currentMonthVN } from "@/lib/timezone";
import { getRevenueByMonth, getRevenueByRoute, getSummaryCounts } from "@/services/statsService";
import {
  buildMonthWindow,
  formatMonthTitle,
  monthOptions,
  monthRevenue,
  resolveMonth,
  shiftMonth,
  toRouteChartData,
} from "@/lib/adminChartData";
import { MonthlyRevenueChart, RouteRevenueChart } from "@/components/admin/RevenueCharts";
import MonthPicker from "@/components/admin/MonthPicker";

export const metadata = {
  title: "Tổng quan — Quản trị",
};

const VND = new Intl.NumberFormat("vi-VN");

const CARD = "rounded-[10px] border border-sand-100 bg-white shadow-sm";

function StatCard({ label, value, hint, tone, children, href }) {
  const body = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone}`}>{children}</span>
      <div className="min-w-0">
        <p className="text-[13px] text-ink/70">{label}</p>
        <p className="truncate text-2xl font-bold text-sea-900">{value}</p>
        <p className="text-xs text-ink/60">{hint}</p>
      </div>
    </>
  );
  const cls = `flex items-center gap-4 p-5 ${CARD}`;
  return href ? (
    <Link href={href} className={`${cls} transition-shadow hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <section className={`min-w-0 p-5 md:p-6 ${CARD}`}>
      <h2 className="text-base font-semibold text-sea-900">{title}</h2>
      <p className="mb-4 mt-1 text-[13px] text-ink/70">{subtitle}</p>
      {children}
    </section>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "h-5 w-5",
};

export default async function AdminHomePage({ searchParams }) {
  await guardAdminPage();
  await dbConnect();

  const params = (await searchParams) ?? {};
  const currentYm = currentMonthVN();
  const month = resolveMonth(params.month, currentYm);
  const monthTitle = formatMonthTitle(month);
  const isCurrent = month === currentYm;

  const [byMonth, byRoute, counts] = await Promise.all([
    getRevenueByMonth(),
    getRevenueByRoute(month),
    getSummaryCounts(month),
  ]);

  const options = monthOptions(byMonth, currentYm);
  const earliest = options[options.length - 1].value;
  const prev = month > earliest ? shiftMonth(month, -1) : null;
  const next = month < currentYm ? shiftMonth(month, 1) : null;

  const revenue = monthRevenue(byMonth, month);
  const prevRevenue = monthRevenue(byMonth, shiftMonth(month, -1));
  const monthlyData = buildMonthWindow(byMonth, month);
  const routeData = toRouteChartData(byRoute);
  const needManualRefund = counts.manual_refund_pending > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-sea-900">Tổng quan · Tháng {monthTitle}</h1>
          <p className="mt-1 text-sm text-ink/70">
            Doanh thu = tiền vé của các đơn thanh toán trong tháng + phí phạt hủy vé xử lý trong tháng. Phần hoàn lại
            khách không tính.
          </p>
        </div>
        <MonthPicker options={options} selected={month} current={currentYm} prev={prev} next={next} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Doanh thu tháng ${monthTitle}`}
          value={`${VND.format(revenue.total_revenue)}đ`}
          hint={`Tháng trước (${formatMonthTitle(shiftMonth(month, -1))}): ${VND.format(prevRevenue.total_revenue)}đ`}
          tone="bg-sea-100 text-coral-600"
        >
          <svg {...iconProps}>
            <path d="M3 7h18v10H3z" />
            <circle cx="12" cy="12" r="2.5" />
            <path d="M7 12h.01M17 12h.01" />
          </svg>
        </StatCard>
        <StatCard
          label="Vé đã bán trong tháng"
          value={VND.format(counts.tickets_sold)}
          hint="Ghế thuộc đơn đã thanh toán trong tháng"
          tone="bg-amber-100 text-amber-800"
        >
          <svg {...iconProps}>
            <path d="M4 7h16a1 1 0 011 1v2.5a1.5 1.5 0 000 3V16a1 1 0 01-1 1H4a1 1 0 01-1-1v-2.5a1.5 1.5 0 000-3V8a1 1 0 011-1z" />
            <path d="M14 7v10" />
          </svg>
        </StatCard>
        <StatCard
          label="Đơn đã hủy trong tháng"
          value={VND.format(counts.cancelled_bookings)}
          hint="Đã thanh toán rồi hủy, hoàn tiền trong tháng"
          tone="bg-rose-100 text-danger"
        >
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="9" />
            <path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        </StatCard>
        <StatCard
          label="Cần hoàn tiền tay"
          value={VND.format(counts.manual_refund_pending)}
          hint={needManualRefund ? "Hiện tại · bấm để xử lý ở mục Booking" : "Hiện tại · không có đơn nào đang chờ"}
          tone={needManualRefund ? "bg-amber-100 text-warning" : "bg-green-100 text-success"}
          href="/admin/bookings"
        >
          <svg {...iconProps}>
            <path d="M3 12a9 9 0 109-9 9.8 9.8 0 00-6.7 2.8L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </StatCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Doanh thu theo tháng"
          subtitle="12 tháng gần nhất · bấm vào một cột để xem tháng đó · cột chồng: doanh thu vé và phí phạt hủy (trục: triệu đồng)"
        >
          <MonthlyRevenueChart data={monthlyData} currentMonth={currentYm} />
        </ChartCard>

        <ChartCard
          title={`Doanh thu theo tuyến bay · Tháng ${monthTitle}`}
          subtitle={isCurrent ? "Tháng đang diễn ra · 8 tuyến có doanh thu cao nhất" : "8 tuyến có doanh thu cao nhất trong tháng"}
        >
          {routeData.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink/60">Tháng {monthTitle} chưa có doanh thu.</p>
          ) : (
            <RouteRevenueChart data={routeData} />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
