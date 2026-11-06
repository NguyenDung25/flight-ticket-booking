import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import Flight from "@/models/Flight";
import Airline from "@/models/Airline";
import { OWN_AIRLINE_CODE } from "@/config/constants";
import { toVN } from "@/lib/timezone";
import { buildAdminFlightFilter } from "@/lib/adminFlightFilter";
import PriceTable from "./PriceTable";

export const metadata = {
  title: "Giá vé — Quản trị",
};

export default async function AdminPricesPage({ searchParams }) {
  await guardAdminPage("flight_prices");
  await dbConnect();
  // Website chỉ bán vé của một hãng nên chỉ liệt kê chuyến bay của hãng đó.
  const { q, date } = await searchParams;
  const own = await Airline.findOne({ code: OWN_AIRLINE_CODE }).select("_id").lean();
  const { filter, qText, dateText, filtered } = buildAdminFlightFilter({ airlineId: own?._id, q, date });
  const docs = await Flight.find(filter)
    .sort({ departure_time: 1 })
    .limit(200)
    .lean();

  const flights = docs.map((f) => ({
    id: String(f._id),
    flight_number: f.flight_number,
    route: `${f.origin_code} → ${f.dest_code}`,
    departure: f.departure_time ? toVN(f.departure_time).format("HH:mm DD/MM/YYYY") : "—",
    status: f.status,
    economy: f.base_price?.economy ?? "",
    business: f.base_price?.business ?? "",
    has_business_seats: f.seats?.some((s) => s.seat_class === "business") ?? false,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Giá vé</h1>
        <p className="text-sm text-ink/60">
          Điều chỉnh giá vé phổ thông và thương gia của từng chuyến ({flights.length} chuyến {filtered ? "phù hợp bộ lọc" : "sắp khởi hành"}). Giá mới chỉ áp
          dụng cho đơn đặt vé tạo sau khi lưu — vé đã bán giữ nguyên giá.
        </p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-100 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink/60">
          Số hiệu
          <input name="q" defaultValue={qText} placeholder="VD: 9G84" className="w-32 rounded-lg border border-sand-100 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink/60">
          Ngày bay (giờ VN)
          <input type="date" name="date" defaultValue={dateText} className="rounded-lg border border-sand-100 px-2 py-1.5 text-sm" />
        </label>
        <button type="submit" className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sea-700">Lọc</button>
        {filtered && <Link href="/admin/prices" className="py-1.5 text-sm font-medium text-ink/60 hover:underline">Bỏ lọc</Link>}
      </form>
      <PriceTable flights={flights} />
    </div>
  );
}
