import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import Aircraft from "@/models/Aircraft";
import AircraftForm from "./AircraftForm";
import AircraftRow from "./AircraftRow";
import { detectLayout } from "@/lib/seatLayout";

export const metadata = {
  title: "Máy bay — Quản trị",
};

export default async function AdminAircraftPage() {
  await guardAdminPage();
  await dbConnect();
  const aircraftDocs = await Aircraft.find().sort({ name: 1 }).lean();

  const aircraft = aircraftDocs.map((a) => {
    const businessCount = a.seat_map_template.filter((s) => s.seat_class === "business").length;
    const economyCount = a.seat_map_template.filter((s) => s.seat_class === "economy").length;
    return {
      id: String(a._id),
      name: a.name,
      total_seats: a.total_seats,
      businessCount,
      economyCount,
      layout: detectLayout(a.seat_map_template),
      // Cờ cảnh báo — mismatch không bị chặn ở DB (ghi chú trong models/Aircraft.js: "ngoài phạm vi đồ án, mục 6").
      mismatch: businessCount + economyCount !== a.total_seats,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Máy bay</h1>
        <p className="text-sm text-ink/60">
          {aircraft.length} loại máy bay. Cấu hình ghế theo hạng (số hàng × số ghế mỗi hàng của Business / Economy) là nguồn
          DUY NHẤT sinh ghế khi tạo chuyến bay (A1) — sửa cấu hình chỉ áp dụng cho chuyến bay tạo sau, không đổi các chuyến đã có.
        </p>
      </div>

      <AircraftForm />

      <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Tên</th>
              <th className="px-4 py-3">Tổng ghế khai báo</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Economy</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {aircraft.map((a) => (
              <AircraftRow key={a.id} aircraft={a} />
            ))}
          </tbody>
        </table>
        {aircraft.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink/50">Chưa có máy bay nào.</p>
        )}
      </div>
    </div>
  );
}
