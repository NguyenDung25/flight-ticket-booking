"use client";

// app/admin/promotions/PromotionsTable.jsx
//
// A5 — bảng mã khuyến mãi + sửa/xóa. Sửa mở 1 hàng phụ ngay dưới dòng (cùng
// kiểu FlightsTable/EditFlightRow); xóa xác nhận 2 bước ngay trên dòng (không
// có Modal trong components/ui, xem BookingList.jsx). `code` không sửa được
// (xem app/api/admin/promotions/[id]/route.js).
//
// Dữ liệu ngày nhận từ page.js đã ở dạng "YYYY-MM-DD" giờ VN (valid_from_date /
// valid_until_date) — valid_until_date là ngày CUỐI CÙNG còn hiệu lực (đã trừ
// đi mốc "00:00 ngày kế tiếp" lưu ở DB), khớp với ô "Đến ngày" lúc tạo.

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls =
  "rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500";

function EditRow({ promotion, onClose }) {
  const router = useRouter();
  const [discountPercent, setDiscountPercent] = useState(String(promotion.discount_percent));
  const [validFrom, setValidFrom] = useState(promotion.valid_from_date);
  const [validUntil, setValidUntil] = useState(promotion.valid_until_date);
  const [usageLimit, setUsageLimit] = useState(promotion.usage_limit ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (validUntil < validFrom) {
      setError("Ngày hết hạn phải từ ngày bắt đầu trở đi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promotions/${promotion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discount_percent: Number(discountPercent),
          valid_from: validFrom,
          valid_until: validUntil,
          usage_limit: usageLimit === "" ? null : Number(usageLimit),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      router.refresh();
      onClose();
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  return (
    <tr className="border-b border-sand-100 bg-sand-50">
      <td colSpan={6} className="px-4 py-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <p className="w-full text-xs text-ink/60">
            Đang sửa mã <span className="font-mono font-semibold text-ink">{promotion.code}</span> (mã không đổi được).
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/60">Giảm giá (%)</label>
            <input type="number" min={0} max={100} required value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)} className={`w-28 ${inputCls}`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/60">Từ ngày</label>
            <input type="date" required value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/60">Đến ngày</label>
            <input type="date" required value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-ink/60">Giới hạn lượt dùng</label>
            <input type="number" min={Math.max(1, promotion.used_count)} value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)} placeholder="Để trống = không giới hạn"
              className={`w-44 ${inputCls}`} />
          </div>
          <button type="submit" disabled={pending}
            className="rounded-lg bg-sea-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sea-700 disabled:opacity-50">
            {pending ? "Đang lưu..." : "Lưu"}
          </button>
          <button type="button" onClick={onClose} disabled={pending}
            className="rounded-lg bg-sand-100 px-4 py-1.5 text-sm font-medium text-ink">
            Hủy bỏ
          </button>
          {error && <p className="w-full text-xs text-danger">{error}</p>}
        </form>
      </td>
    </tr>
  );
}

function DeleteControl({ promotion }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/promotions/${promotion.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setPending(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button type="button" onClick={() => setConfirming(true)}
          className="text-xs font-medium text-danger hover:underline">
          Xóa
        </button>
        {error && <p className="max-w-[16rem] text-xs text-danger">{error}</p>}
      </div>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-ink/70">Xóa mã này?</span>
      <button type="button" onClick={handleDelete} disabled={pending}
        className="font-medium text-danger hover:underline disabled:opacity-50">
        {pending ? "Đang xóa..." : "Có"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={pending}
        className="font-medium text-ink/60 hover:underline">
        Không
      </button>
    </span>
  );
}

export default function PromotionsTable({ promotions }) {
  const [editingId, setEditingId] = useState(null);

  return (
    <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
          <tr>
            <th className="px-4 py-3">Mã</th>
            <th className="px-4 py-3">Giảm giá</th>
            <th className="px-4 py-3">Hiệu lực</th>
            <th className="px-4 py-3">Lượt dùng</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {promotions.map((p) => (
            <FragmentRows key={p.id} p={p} editing={editingId === p.id}
              onToggleEdit={() => setEditingId((prev) => (prev === p.id ? null : p.id))}
              onClose={() => setEditingId(null)} />
          ))}
        </tbody>
      </table>
      {promotions.length === 0 && (
        <p className="px-4 py-6 text-sm text-ink/50">Chưa có mã khuyến mãi nào.</p>
      )}
    </div>
  );
}

function FragmentRows({ p, editing, onToggleEdit, onClose }) {
  return (
    <>
      <tr className="border-b border-sand-100 last:border-0">
        <td className="px-4 py-3 font-mono text-xs font-semibold">{p.code}</td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center rounded-full bg-coral-500/10 px-2.5 py-1 text-sm font-bold text-coral-600">
            -{p.discount_percent}%
          </span>
        </td>
        <td className="px-4 py-3 text-ink/60">
          {p.valid_from_label} – {p.valid_until_label}
        </td>
        <td className="px-4 py-3 text-ink/70">
          {p.used_count}
          {p.usage_limit != null ? ` / ${p.usage_limit}` : " (không giới hạn)"}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
              p.statusLabel === "Đang hiệu lực"
                ? "border-success/30 bg-success/10 text-success"
                : "border-ink/15 bg-ink/5 text-ink/50"
            }`}
          >
            {p.statusLabel}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-start gap-4">
            <button type="button" onClick={onToggleEdit}
              className="text-xs font-medium text-sea-700 hover:underline">
              {editing ? "Đóng" : "Sửa"}
            </button>
            <DeleteControl promotion={p} />
          </div>
        </td>
      </tr>
      {editing && <EditRow promotion={p} onClose={onClose} />}
    </>
  );
}
