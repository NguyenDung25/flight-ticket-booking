// app/admin/airlines/page.js
//
// A2 — quản lý hãng bay: liệt kê + thêm mới (AirlineForm) + sửa/xóa từng dòng
// (AirlineRow, gọi PUT/DELETE /api/admin/airlines/[id]). Xóa bị chặn nếu còn
// chuyến bay thuộc hãng.
//
// Gọi thẳng Airline.find() (KHÔNG qua /api/admin/airlines) — đúng convention
// mọi page.js khác trong khu Admin.

import dbConnect from "@/lib/mongodb";
import Airline from "@/models/Airline";
import AirlineForm from "./AirlineForm";
import AirlineRow from "./AirlineRow";

export const metadata = {
  title: "Hãng bay — Quản trị",
};

export default async function AdminAirlinesPage() {
  await dbConnect();
  const airlineDocs = await Airline.find().sort({ code: 1 }).lean();

  const airlines = airlineDocs.map((a) => ({
    id: String(a._id),
    code: a.code,
    name_vi: a.name?.vi ?? "",
    name_en: a.name?.en ?? "",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Hãng bay</h1>
        <p className="text-sm text-ink/60">
          {airlines.length} hãng bay.
        </p>
      </div>

      <AirlineForm />

      <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Tên (VI)</th>
              <th className="px-4 py-3">Tên (EN)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {airlines.map((a) => (
              <AirlineRow key={a.id} airline={a} />
            ))}
          </tbody>
        </table>
        {airlines.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink/50">Chưa có hãng bay nào.</p>
        )}
      </div>
    </div>
  );
}
