import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import Flight from "@/models/Flight";
import Airline from "@/models/Airline";
import { OWN_AIRLINE_CODE } from "@/config/constants";
import { toVN } from "@/lib/timezone";
import PriceTable from "./PriceTable";

export const metadata = {
  title: "Giá vé — Quản trị",
};

export default async function AdminPricesPage() {
  await guardAdminPage("flight_prices");
  await dbConnect();
  // Website chỉ bán vé của một hãng nên chỉ liệt kê chuyến bay của hãng đó.
  const own = await Airline.findOne({ code: OWN_AIRLINE_CODE }).select("_id").lean();
  const docs = await Flight.find({ airline_id: own?._id ?? null })
    .sort({ departure_time: -1 })
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
          Điều chỉnh giá vé phổ thông và thương gia của từng chuyến ({flights.length} chuyến gần nhất). Giá mới chỉ áp
          dụng cho đơn đặt vé tạo sau khi lưu — vé đã bán giữ nguyên giá.
        </p>
      </div>
      <PriceTable flights={flights} />
    </div>
  );
}
