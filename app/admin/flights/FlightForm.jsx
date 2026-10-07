"use client";

// app/admin/flights/FlightForm.jsx
//
// A1 — tạo chuyến bay mới. Cùng convention với AircraftForm/AirlineForm
// (form thô luôn hiện phía trên bảng, không modal — xem comment
// app/[locale]/my-bookings/BookingList.jsx: dự án cố tình không có
// Modal/dialog riêng trong components/ui, không tự chế thêm chỉ cho 1 chỗ).
//
// KHÔNG gửi seats[] lên — API (POST /api/admin/flights) tự sinh từ
// Aircraft.cloneSeatMapForFlight(), form chỉ gửi đúng field mà route đó đọc.
//
// origin_code/dest_code chọn qua <select> (danh sách Airport có sẵn, đã seed
// từ AirLabs) thay vì gõ tay — tránh admin gõ sai mã IATA 3 ký tự, lỗi chỉ lộ
// ra khi khách tìm kiếm không thấy chuyến (khó debug hơn nhiều so với chặn
// ngay ở đây).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const emptyForm = {
  flight_number: "",
  airline_id: "",
  aircraft_id: "",
  origin_code: "",
  dest_code: "",
  departure_time: "",
  arrival_time: "",
  price_economy: "",
  price_business: "",
};

export default function FlightForm({ airlines, aircraft, airports }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(true);
  // Tra cứu lịch bay từ AirLabs để tự điền (xem GET /api/admin/airlabs/schedules)
  const [lookup, setLookup] = useState({ loading: false, error: null, schedules: null, note: null });

  const selectedAircraft = useMemo(
    () => aircraft.find((a) => a.id === form.aircraft_id) ?? null,
    [aircraft, form.aircraft_id]
  );

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleLookup() {
    setLookup({ loading: true, error: null, schedules: null, note: null });
    try {
      const res = await fetch(
        `/api/admin/airlabs/schedules?dep=${form.origin_code}&arr=${form.dest_code}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Không tra cứu được AirLabs.");
      setLookup({
        loading: false,
        error: null,
        schedules: data.schedules,
        note: data.schedules.length === 0 ? "AirLabs không có lịch bay cho tuyến này — hãy nhập tay." : null,
      });
    } catch (err) {
      setLookup({ loading: false, error: err.message, schedules: null, note: null });
    }
  }

  // Chọn 1 lịch bay -> tự điền số hiệu, hãng (nếu hệ thống đã có hãng đó) và giờ.
  // Nếu admin ĐÃ chọn ngày khởi hành thì giữ ngày đó, chỉ lấy giờ/thời lượng từ
  // AirLabs (lịch của AirLabs lặp hằng ngày, ngày trong kết quả không có ý
  // nghĩa). Cộng/trừ trên chuỗi "…Z" (UTC giả) để không lệ thuộc múi giờ máy.
  function applySchedule(s) {
    const durationMs = new Date(`${s.arr_vn}:00Z`) - new Date(`${s.dep_vn}:00Z`);
    const datePart = form.departure_time ? form.departure_time.slice(0, 10) : s.dep_vn.slice(0, 10);
    const dep = new Date(`${datePart}T${s.dep_vn.slice(11)}:00Z`);
    const arr = new Date(dep.getTime() + durationMs);
    const matchedAirline = airlines.find(
      (a) => s.airline_iata && a.code.toUpperCase() === s.airline_iata.toUpperCase()
    );
    setForm((prev) => ({
      ...prev,
      flight_number: s.flight_iata,
      airline_id: matchedAirline ? matchedAirline.id : prev.airline_id,
      departure_time: dep.toISOString().slice(0, 16),
      arrival_time: arr.toISOString().slice(0, 16),
    }));
    setLookup((prev) => ({
      ...prev,
      note: matchedAirline
        ? "Đã điền số hiệu và giờ bay — kiểm tra lại ngày, tàu bay và giá trước khi tạo."
        : `Đã điền số hiệu và giờ bay. Hãng ${s.airline_iata ?? "?"} chưa có trong hệ thống — hãy chọn hãng thủ công.`,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (form.origin_code && form.origin_code === form.dest_code) {
      setError("Điểm đi và điểm đến không được trùng nhau.");
      return;
    }
    // Cùng điều kiện với models/Flight.js pre-validate (ghi chú s) — chặn
    // sớm ở client, tránh 1 round-trip vô ích khi chắc chắn sẽ bị API từ chối.
    if (selectedAircraft?.has_business_seats && !form.price_business) {
      setError("Tàu bay này có ghế business — bắt buộc nhập giá business.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/flights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flight_number: form.flight_number.trim(),
          airline_id: form.airline_id,
          aircraft_id: form.aircraft_id,
          origin_code: form.origin_code,
          dest_code: form.dest_code,
          // input datetime-local không mang timezone — trình duyệt admin
          // mặc định chạy giờ VN (đúng giả định lib/timezone.js đã ghi ở đầu
          // file: mọi mốc thời gian đối chiếu qua GMT+7), nên new Date(...)
          // ở đây ra đúng UTC tương ứng mà không cần tự quy đổi thủ công.
          // datetime-local không mang timezone — thêm "+07:00" tường minh để
          // new Date() luôn parse đúng là giờ VN bất kể múi giờ máy admin.
          departure_time: new Date(form.departure_time + "+07:00").toISOString(),
          arrival_time: new Date(form.arrival_time + "+07:00").toISOString(),
          base_price: {
            economy: Number(form.price_economy),
            ...(form.price_business ? { business: Number(form.price_business) } : {}),
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Có lỗi xảy ra.");
      }
      setForm(emptyForm);
      setLookup({ loading: false, error: null, schedules: null, note: null });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="self-start rounded-lg bg-sea-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700"
      >
        + Tạo chuyến bay
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-sand-100 bg-white p-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Số hiệu chuyến bay</label>
          <input
            value={form.flight_number}
            onChange={(e) => update("flight_number", e.target.value)}
            required
            placeholder="VD: 9G123"
            className="w-32 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Hãng bay</label>
          <select
            value={form.airline_id}
            onChange={(e) => update("airline_id", e.target.value)}
            required
            className="w-44 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          >
            <option value="">— Chọn hãng bay —</option>
            {airlines.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name_vi}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Tàu bay</label>
          <select
            value={form.aircraft_id}
            onChange={(e) => update("aircraft_id", e.target.value)}
            required
            className="w-48 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          >
            <option value="">— Chọn tàu bay —</option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.total_seats} ghế{a.has_business_seats ? ", có business" : ""})
              </option>
            ))}
          </select>
          {/* Không sửa được sau khi tạo (EDITABLE_FIELDS của PATCH bỏ hẳn
              aircraft_id — xem EditFlightButton.jsx), nên nhắc admin kiểm
              tra kỹ ngay từ bước tạo, không đợi sửa sau. */}
          <p className="text-[11px] text-ink/40">Không sửa được sau khi tạo.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Điểm đi</label>
          <select
            value={form.origin_code}
            onChange={(e) => update("origin_code", e.target.value)}
            required
            className="w-56 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          >
            <option value="">— Chọn điểm đi —</option>
            {airports.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Điểm đến</label>
          <select
            value={form.dest_code}
            onChange={(e) => update("dest_code", e.target.value)}
            required
            className="w-56 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          >
            <option value="">— Chọn điểm đến —</option>
            {airports.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tự điền từ AirLabs — chỉ là gợi ý, luôn có thể nhập tay */}
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-sand-100 bg-sand-50 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLookup}
            disabled={!form.origin_code || !form.dest_code || form.origin_code === form.dest_code || lookup.loading}
            className="rounded-lg border border-sea-700 px-3 py-1.5 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {lookup.loading ? "Đang tra cứu..." : "Tra cứu lịch bay từ AirLabs"}
          </button>
          <span className="text-[11px] text-ink/40">
            Chọn điểm đi/đến trước, rồi bấm để tự điền số hiệu và giờ bay.
          </span>
        </div>
        {lookup.error && <p className="text-xs text-danger">{lookup.error}</p>}
        {lookup.note && <p className="text-xs text-ink/60">{lookup.note}</p>}
        {lookup.schedules && lookup.schedules.length > 0 && (
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {lookup.schedules.map((s) => (
              <button
                key={`${s.flight_iata}-${s.dep_vn}`}
                type="button"
                onClick={() => applySchedule(s)}
                className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-1.5 text-left text-xs hover:bg-sea-500/10"
              >
                <span className="font-mono font-semibold">{s.flight_iata}</span>
                <span className="text-ink/60">
                  {s.dep_vn.slice(11)} → {s.arr_vn.slice(11)} (giờ VN)
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Giờ khởi hành (giờ VN)</label>
          <input
            type="datetime-local"
            value={form.departure_time}
            onChange={(e) => update("departure_time", e.target.value)}
            required
            className="rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Giờ đến (giờ VN)</label>
          <input
            type="datetime-local"
            value={form.arrival_time}
            onChange={(e) => update("arrival_time", e.target.value)}
            required
            className="rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">Giá economy (VNĐ)</label>
          <input
            type="number"
            min={0}
            value={form.price_economy}
            onChange={(e) => update("price_economy", e.target.value)}
            required
            className="w-36 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-ink/60">
            Giá business (VNĐ){selectedAircraft?.has_business_seats ? " — bắt buộc" : ""}
          </label>
          <input
            type="number"
            min={0}
            value={form.price_business}
            onChange={(e) => update("price_business", e.target.value)}
            required={Boolean(selectedAircraft?.has_business_seats)}
            disabled={selectedAircraft ? !selectedAircraft.has_business_seats : false}
            className="w-36 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500 disabled:bg-sand-50 disabled:text-ink/30"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
        >
          {pending ? "Đang tạo..." : "Tạo chuyến bay"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCollapsed(true);
            setForm(emptyForm);
            setError(null);
            setLookup({ loading: false, error: null, schedules: null, note: null });
          }}
          disabled={pending}
          className="rounded-lg bg-sand-100 px-4 py-1.5 text-sm font-medium text-ink"
        >
          Đóng
        </button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
