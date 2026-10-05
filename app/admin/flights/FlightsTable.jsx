"use client";

// app/admin/flights/FlightsTable.jsx
//
// A1 (sửa) + A8 (hủy chuyến, dùng lại CancelFlightButton.jsx như cũ, không
// đổi gì file đó). Toàn bộ bảng chuyển thành Client Component (khác mọi
// page.js khác trong khu Admin — thường render bảng ngay trong Server
// Component) VÌ "Sửa" cần mở 1 hàng phụ NGAY DƯỚI dòng đang sửa, trải rộng
// hết bề ngang bảng (colSpan) — không phải overlay/modal (dự án cố tình
// không có Modal/dialog riêng trong components/ui, không tự chế thêm 1
// component chỉ cho chỗ này, xem comment gốc
// app/[locale]/my-bookings/BookingList.jsx). Mở hàng phụ kiểu này cần biết
// "đang sửa dòng nào" ở cấp CẢ BẢNG (chỉ 1 dòng được sửa cùng lúc), nên
// state phải nằm ở component cha bọc <table>, không thể để riêng từng nút tự
// quản trạng thái như CancelFlightButton.
//
// CHỈ sửa đúng field PATCH /api/admin/flights/[id] thật sự nhận
// (EDITABLE_FIELDS trong route đó): flight_number, origin_code, dest_code,
// departure_time, arrival_time, base_price, status. KHÔNG có airline_id hay
// aircraft_id — route bỏ qua 2 field này dù có gửi lên, nên form không hỏi.
//
// ĐÃ XỬ LÝ (services/flightService.assertNoActiveBooking, ghi chú v): route
// PATCH giờ chặn cứng (409) nếu sửa departure_time mà chuyến đã có booking
// hiệu lực (pending_payment/confirmed) — form dưới đây cần tự hiện lỗi 409
// đó cho admin thấy rõ (xem handleSubmit, đã đọc data?.message từ response
// lỗi và set vào `error` state), KHÔNG cần tự chặn lại phía client ở đây.

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import CancelFlightButton from "./CancelFlightButton";
import DeleteFlightButton from "./DeleteFlightButton";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

/**
 * Bản client-side quy đổi ISO string -> "YYYY-MM-DDTHH:mm" theo giờ VN, cho
 * value mặc định của <input type="datetime-local">. KHÔNG import
 * lib/timezone.js ở đây — cùng lý do đã ghi ở PassengersForm.jsx
 * (ageInYearsLocal): file đó coi là server-only, chỉ cần đúng phép quy đổi
 * hiển thị, không cần kéo theo mọi hằng số C10 không liên quan tới bảng này.
 */
function toDatetimeLocalVN(isoString) {
  if (!isoString) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoString));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function formToEditState(flight) {
  return {
    flight_number: flight.flight_number,
    origin_code: flight.origin_code,
    dest_code: flight.dest_code,
    departure_time: toDatetimeLocalVN(flight.departure_time),
    arrival_time: toDatetimeLocalVN(flight.arrival_time),
    price_economy: flight.base_price_economy ?? "",
    price_business: flight.base_price_business ?? "",
  };
}

function EditFlightRow({ flight, airports, colSpan, onClose }) {
  const router = useRouter();
  const [form, setForm] = useState(() => formToEditState(flight));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (form.origin_code === form.dest_code) {
      setError("Điểm đi và điểm đến không được trùng nhau.");
      return;
    }
    if (flight.has_business_seats && !form.price_business) {
      setError("Chuyến này có ghế business — bắt buộc nhập giá business.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/flights/${flight.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flight_number: form.flight_number.trim(),
          origin_code: form.origin_code,
          dest_code: form.dest_code,
          departure_time: new Date(form.departure_time).toISOString(),
          arrival_time: new Date(form.arrival_time).toISOString(),
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
      onClose();
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <tr className="border-b border-sand-100 bg-sand-50/70 last:border-0">
      <td colSpan={colSpan} className="px-4 py-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink/60">Số hiệu chuyến bay</label>
              <input
                value={form.flight_number}
                onChange={(e) => update("flight_number", e.target.value)}
                required
                className="w-32 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink/60">Điểm đi</label>
              <select
                value={form.origin_code}
                onChange={(e) => update("origin_code", e.target.value)}
                required
                className="w-52 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
              >
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
                className="w-52 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500"
              >
                {airports.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
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
                Giá business (VNĐ){flight.has_business_seats ? " — bắt buộc" : ""}
              </label>
              <input
                type="number"
                min={0}
                value={form.price_business}
                onChange={(e) => update("price_business", e.target.value)}
                required={flight.has_business_seats}
                disabled={!flight.has_business_seats}
                className="w-36 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500 disabled:bg-sand-100 disabled:text-ink/30"
              />
            </div>
          </div>

          <p className="text-[11px] text-ink/40">
            Không đổi được hãng bay / tàu bay ở đây — tạo chuyến mới nếu nhập sai.
          </p>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
            >
              {pending ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg bg-sand-100 px-4 py-1.5 text-sm font-medium text-ink"
            >
              Hủy bỏ
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

// --- A8: nút hủy chuyến — logic ở CancelFlightButton.jsx (file riêng, giữ
// nguyên như cũ, chỉ import lại ở đây). A1 (ghi chú v): nút xóa hẳn — logic
// ở DeleteFlightButton.jsx (file riêng mới, cùng convention). ---

const COLUMN_COUNT = 9;

export default function FlightsTable({ flights, airports }) {
  // Chỉ 1 dòng được sửa cùng lúc — mở dòng khác tự đóng dòng đang mở, tránh
  // nhiều form PATCH lơ lửng cùng lúc dễ gây nhầm lẫn đang sửa chuyến nào.
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
          <tr>
            <th className="px-4 py-3">Chuyến</th>
            <th className="px-4 py-3">Tuyến</th>
            <th className="px-4 py-3">Giờ bay (VN)</th>
            <th className="px-4 py-3">Hãng / Tàu bay</th>
            <th className="px-4 py-3">Giá economy</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3"></th>
            <th className="px-4 py-3"></th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f) => (
            <Fragment key={f.id}>
              <tr className="border-b border-sand-100 align-top last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{f.flight_number}</td>
                <td className="px-4 py-3">
                  {f.origin_code} → {f.dest_code}
                </td>
                <td className="px-4 py-3 text-ink/60">
                  {f.departure_time
                    ? new Date(f.departure_time).toLocaleString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {f.airline_name} · {f.aircraft_name}
                </td>
                <td className="px-4 py-3 text-ink/70">
                  {f.base_price_economy != null
                    ? `${CURRENCY_FORMATTER.format(f.base_price_economy)}đ`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {/* KHÔNG dùng StatusBadge dùng chung — component đó cố
                      định 5 tone theo đúng Booking.status (xem comment gốc
                      trong file), "scheduled" không khớp key nào sẽ rơi vào
                      fallback màu vàng cảnh báo, sai ý nghĩa cho chuyến bay
                      đang khai thác bình thường. Badge riêng cho Flight. */}
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                      f.status === "cancelled"
                        ? "border-ink/15 bg-ink/5 text-ink/50"
                        : "border-success/30 bg-success/10 text-success"
                    }`}
                  >
                    {f.status === "cancelled" ? "Đã hủy" : "Đang khai thác"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {f.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => setEditingId((prev) => (prev === f.id ? null : f.id))}
                      className="rounded-lg border border-sea-700 px-3 py-1.5 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
                    >
                      {editingId === f.id ? "Đóng" : "Sửa"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <CancelFlightButton flightId={f.id} status={f.status} />
                </td>
                <td className="px-4 py-3">
                  <DeleteFlightButton flightId={f.id} />
                </td>
              </tr>
              {editingId === f.id && (
                <EditFlightRow
                  key={`${f.id}-edit`}
                  flight={f}
                  airports={airports}
                  colSpan={COLUMN_COUNT}
                  onClose={() => setEditingId(null)}
                />
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {flights.length === 0 && <p className="px-4 py-6 text-sm text-ink/50">Chưa có chuyến bay nào.</p>}
    </div>
  );
}
