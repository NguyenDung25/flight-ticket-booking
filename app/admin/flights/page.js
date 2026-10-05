// app/admin/flights/page.js
//
// A1 (tạo/sửa chuyến bay) + A8 (hủy chuyến bay + cascade hủy booking liên
// quan). FlightForm (tạo mới) dùng ở đây; bảng danh sách + sửa/hủy từng dòng
// chuyển hết vào FlightsTable (Client Component) — sửa cần mở 1 hàng phụ
// full-width NGAY DƯỚI dòng đang sửa (xem comment FlightsTable.jsx: dự án
// không có Modal/dialog riêng, không tự chế thêm 1 component chỉ cho chỗ
// này), việc đó cần state ở cấp bảng nên không thể để page.js (Server
// Component) tự render <tr> tĩnh như trước. A2 (Airline/Aircraft) vẫn là
// trang riêng (app/admin/airlines, app/admin/aircraft).
//
// Gọi thẳng Flight.find()/Airline.find()/Aircraft.find()/Airport.find()
// (KHÔNG qua API) — đúng convention mọi page.js khác trong khu Admin.

import dbConnect from "@/lib/mongodb";
import Flight from "@/models/Flight";
import Airline from "@/models/Airline";
import Aircraft from "@/models/Aircraft";
import Airport from "@/models/Airport";
import FlightForm from "./FlightForm";
import FlightsTable from "./FlightsTable";

export const metadata = {
  title: "Chuyến bay — Quản trị",
};

export default async function AdminFlightsPage() {
  await dbConnect();
  const [flightDocs, airlineDocs, aircraftDocs, airportDocs] = await Promise.all([
    Flight.find()
      .sort({ departure_time: -1 })
      .limit(200)
      .populate("airline_id", "code name")
      .populate("aircraft_id", "name")
      .lean(),
    Airline.find().sort({ code: 1 }).lean(),
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
    // Chuyến có ghế business hay không — quyết định base_price.business có
    // bắt buộc khi sửa hay không (đúng validate models/Flight.js pre-validate,
    // xem comment FlightsTable.jsx).
    has_business_seats: f.seats?.some((s) => s.seat_class === "business") ?? false,
    status: f.status,
  }));

  // Chỉ cần các field selects/preview cần dùng — KHÔNG truyền nguyên
  // seat_map_template (có thể vài trăm phần tử/loại máy bay) qua RSC
  // boundary chỉ để hiển thị 1 dòng "có ghế business hay không".
  const airlines = airlineDocs.map((a) => ({
    id: String(a._id),
    code: a.code,
    name_vi: a.name?.vi ?? a.code,
  }));
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
        <p className="text-sm text-ink/60">{flights.length} chuyến gần nhất.</p>
      </div>

      <FlightForm airlines={airlines} aircraft={aircraft} airports={airports} />

      <FlightsTable flights={flights} airports={airports} />
    </div>
  );
}
