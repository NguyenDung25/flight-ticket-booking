"use client";

import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const VND = new Intl.NumberFormat("vi-VN");
const MILLION = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

const COLOR_TICKET = "#cf4c0a"; // coral-500
const COLOR_PENALTY = "#f6b93b"; // vàng như số "15%" trong ảnh khuyến mãi

const money = (v) => `${VND.format(v)}đ`;
const axisMillion = (v) => MILLION.format(v / 1_000_000);
const shortMoney = (v) => (v >= 1_000_000 ? `${MILLION.format(v / 1_000_000)} tr` : money(v));

// Tháng không được chọn mờ hơn để tháng đang xem nổi bật (dùng `shape` — Cell đã bị Recharts đánh dấu bỏ).
function monthShape(props) {
  return <Rectangle {...props} fillOpacity={props.payload?.selected ? 1 : 0.4} style={{ cursor: "pointer" }} />;
}

export function MonthlyRevenueChart({ data, currentMonth }) {
  const router = useRouter();
  const goToMonth = (bar) => {
    const month = bar?.payload?.month ?? bar?.month;
    if (month) router.push(month === currentMonth ? "/admin" : `/admin?month=${month}`);
  };
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 288 }}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f5e2d2" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
          <YAxis
            tickFormatter={axisMillion}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={44}
          />
          <Tooltip
            formatter={(value, name) => [money(value), name]}
            cursor={{ fill: "rgba(207,76,10,0.07)" }}
          />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="ticket"
            name="Doanh thu vé"
            stackId="revenue"
            fill={COLOR_TICKET}
            maxBarSize={44}
            shape={monthShape}
            onClick={goToMonth}
          />
          <Bar
            dataKey="penalty"
            name="Phí phạt hủy"
            stackId="revenue"
            fill={COLOR_PENALTY}
            maxBarSize={44}
            radius={[4, 4, 0, 0]}
            shape={monthShape}
            onClick={goToMonth}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RouteRevenueChart({ data }) {
  const height = Math.max(200, data.length * 44 + 24);
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 420, height }}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 76, left: 0, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={96}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fontWeight: 600 }}
          />
          <Tooltip
            formatter={(value) => [money(value), "Doanh thu"]}
            cursor={{ fill: "rgba(207,76,10,0.07)" }}
          />
          <Bar
            dataKey="total"
            name="Doanh thu"
            fill={COLOR_TICKET}
            radius={[0, 5, 5, 0]}
            barSize={24}
            background={{ fill: "#ffe2cb", radius: 5 }}
          >
            <LabelList dataKey="total" position="right" formatter={shortMoney} style={{ fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
