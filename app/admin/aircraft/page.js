// app/admin/aircraft/page.js
//
// A2 — quản lý máy bay: liệt kê + thêm mới (AircraftForm) + sửa/xóa từng dòng
// (AircraftRow, gọi PUT/DELETE /api/admin/aircraft/[id]). Xóa bị chặn nếu còn
// chuyến bay dùng loại máy bay này.
//
// Gọi thẳng Aircraft.find() (KHÔNG qua /api/admin/aircraft) — đúng
// convention mọi page.js khác trong khu Admin.

import dbConnect from "@/lib/mongodb";
import Aircraft from "@/models/Aircraft";
import AircraftForm from "./AircraftForm";
import AircraftRow from "./AircraftRow";

export const metadata = {
  title: "Máy bay — Quản trị",
};

export default async function AdminAircraftPage() {
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
      // Cờ cảnh báo — mismatch không bị chặn ở DB (ghi chú trong
      // models/Aircraft.js: "ngoài phạm vi đồ án, mục 6"), nhưng UI vẫn nên
      // tự phát hiện và cảnh báo cho admin biết ngay, thay vì để lộ khi tạo
      // Flight (A1) rồi mới phát hiện seats[] sai.
      mismatch: businessCount + economyCount !== a.total_seats,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Máy bay</h1>
        <p className="text-sm text-ink/60">
          {aircraft.length} loại máy bay. seat_map_template là nguồn DUY NHẤT sinh ghế khi tạo chuyến
          bay (A1) — sửa sơ đồ chỉ áp dụng cho chuyến bay tạo sau, không đổi các chuyến đã có.
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
