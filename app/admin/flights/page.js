import Link from "next/link";
import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import Flight from "@/models/Flight";
import Airline from "@/models/Airline";
import { OWN_AIRLINE_CODE } from "@/config/constants";
import { buildAdminFlightFilter } from "@/lib/adminFlightFilter";
import Aircraft from "@/models/Aircraft";
import Airport from "@/models/Airport";
import { can } from "@/config/adminRoles";
import FlightForm from "./FlightForm";
import FlightsTable from "./FlightsTable";
import FlightsTabs from "./FlightsTabs";
import PopularRoutesAdmin from "./PopularRoutesAdmin";
import { listForAdmin } from "@/services/popularRouteService";

export const metadata = {
  title: "Chuyến bay — Quản trị",
};

// Tab "Tuyến phổ biến" (?tab=routes): quản lý khối "Tuyến bay phổ biến" ở trang chủ khách.
async function RoutesTab() {
  const [initial, airportDocs] = await Promise.all([
    listForAdmin(),
    Airport.find({}, "code name city").sort({ code: 1 }).lean(),
  ]);
  const airports = airportDocs.map((a) => ({
    code: a.code,
    city: a.city ?? "",
    label: `${a.code} — ${a.name?.vi ?? a.code}${a.city ? ` (${a.city})` : ""}`,
  }));
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Chuyến bay</h1>
        <p className="text-sm text-ink/60">Tuyến bay phổ biến hiển thị ở trang chủ.</p>
      </div>
      <FlightsTabs active="routes" />
      <PopularRoutesAdmin initial={initial} airports={airports} />
    </div>
  );
}

export default async function AdminFlightsPage({ searchParams }) {
  const admin = await guardAdminPage("flights");
  await dbConnect();
  const { tab, q, date } = await searchParams;
  if (tab === "routes") return <RoutesTab />;
  // Lọc: số hiệu bắt đầu bằng `q`, hoặc đúng ngày bay (giờ VN). Không lọc thì hiện 200 chuyến sắp khởi hành (từ 24 giờ trước), sớm nhất trước —
  // dữ liệu nhiều ngày nên sắp giảm dần sẽ che mất các chuyến vừa tạo ở ngày gần.
  const { filter, qText, dateText, filtered } = buildAdminFlightFilter({ airlineId: (await Airline.findOne({ code: OWN_AIRLINE_CODE }).select("_id").lean())?._id, q, date });
  const [flightDocs, aircraftDocs, airportDocs] = await Promise.all([
    // Website chỉ bán vé của một hãng nên danh sách chỉ gồm chuyến bay của hãng đó.
    Flight.find(filter)
      .sort({ departure_time: 1 })
      .limit(200)
      .populate("airline_id", "code name")
      .populate("aircraft_id", "name")
      .lean(),
    Aircraft.find().sort({ name: 1 }).lean(),
    Airport.find({}, "code name city").sort({ code: 1 }).lean(),
  ]);

  const flights = flightDocs.map((f) => ({
    id: String(f._id),
    flight_number: f.flight_number,
    origin_code: f.origin_code,
    dest_code: f.dest_code,
    departure_time: f.departure_time ? new Date(f.departure_time).toISOString() : null,
    arrival_time: f.arrival_time ? new Date(f.arrival_time).toISOString() : null,
    airline_name: f.airline_id?.name?.vi ?? f.airline_id?.code ?? "—",
    aircraft_name: f.aircraft_id?.name ?? "—",
    base_price_economy: f.base_price?.economy ?? null,
    base_price_business: f.base_price?.business ?? null,
    // Chuyến có ghế business hay không — quyết định base_price.business có bắt buộc khi sửa hay không.
    has_business_seats: f.seats?.some((s) => s.seat_class === "business") ?? false,
    status: f.status,
  }));

  // Chỉ cần các field selects/preview cần dùng — không truyền nguyên seat_map_template.
  const aircraft = aircraftDocs.map((a) => ({
    id: String(a._id),
    name: a.name,
    total_seats: a.total_seats,
    has_business_seats: a.seat_map_template.some((s) => s.seat_class === "business"),
  }));
  const airports = airportDocs.map((a) => ({
    code: a.code,
    label: `${a.code} — ${a.name?.vi ?? a.code}${a.city ? ` (${a.city})` : ""}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Chuyến bay</h1>
        <p className="text-sm text-ink/60">{flights.length} chuyến {filtered ? "phù hợp bộ lọc" : "sắp khởi hành"}.</p>
      </div>

      <FlightsTabs active="flights" />

      <FlightForm aircraft={aircraft} airports={airports} />

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
        {filtered && <Link href="/admin/flights" className="py-1.5 text-sm font-medium text-ink/60 hover:underline">Bỏ lọc</Link>}
      </form>

      <FlightsTable flights={flights} airports={airports} canEditPrice={can(admin.role, "flight_prices")} />
    </div>
  );
}
