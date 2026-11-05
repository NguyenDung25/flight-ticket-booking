"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CLASSES = [
  { key: "economy", label: "Phổ thông" },
  { key: "business", label: "Thương gia" },
];
const MAX_PACKAGES = 8;

const inputClass =
  "w-32 rounded-lg border border-sand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500";
const fmt = new Intl.NumberFormat("vi-VN");

/** Bảng giá -> state form (số -> chuỗi). */
function toFormState(p) {
  return {
    carry_on_kg: String(p.carry_on_kg),
    included_checked_kg: { economy: String(p.included_checked_kg.economy), business: String(p.included_checked_kg.business) },
    baggage_packages: p.baggage_packages.map((b) => ({ kg: String(b.kg), price: String(b.price) })),
    meal_price: { economy: String(p.meal_price.economy), business: String(p.meal_price.business) },
    meal_included: { ...p.meal_included },
  };
}

function Field({ label, suffix, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <span className="flex items-center gap-2">
        {children}
        {suffix && <span className="text-xs text-ink/50">{suffix}</span>}
      </span>
    </label>
  );
}

export default function AncillaryPricingForm({ initialPricing }) {
  const router = useRouter();
  const [form, setForm] = useState(() => toFormState(initialPricing));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null); // { type: "ok" | "error", text }

  const setPath = (updater) => {
    setMessage(null);
    setForm((f) => updater(structuredClone(f)));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ancillaries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing: form }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      setForm(toFormState(data.pricing));
      setMessage({ type: "ok", text: "Đã lưu bảng giá. Áp dụng cho các booking tạo từ bây giờ." });
      router.refresh();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <section className="rounded-xl border border-sand-100 bg-white p-4">
        <h2 className="font-semibold text-sea-900">Hành lý đã gồm trong vé</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          <Field label="Xách tay (mọi hạng)" suffix="kg">
            <input
              type="number" min={0} max={30} required className={inputClass}
              value={form.carry_on_kg}
              onChange={(e) => setPath((f) => ((f.carry_on_kg = e.target.value), f))}
            />
          </Field>
          {CLASSES.map((c) => (
            <Field key={c.key} label={`Ký gửi — ${c.label}`} suffix="kg">
              <input
                type="number" min={0} max={100} required className={inputClass}
                value={form.included_checked_kg[c.key]}
                onChange={(e) => setPath((f) => ((f.included_checked_kg[c.key] = e.target.value), f))}
              />
            </Field>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-sand-100 bg-white p-4">
        <h2 className="font-semibold text-sea-900">Gói hành lý ký gửi mua thêm</h2>
        <p className="mt-1 text-xs text-ink/60">
          Giá cho 1 khách / 1 chặng, cộng thêm vào phần ký gửi đã gồm. Tối đa {MAX_PACKAGES} gói, không trùng số kg.
        </p>
        <table className="mt-3 text-sm">
          <thead>
            <tr className="text-left text-xs text-ink/60">
              <th className="pb-1 pr-4 font-medium">Số kg</th>
              <th className="pb-1 pr-4 font-medium">Giá (đ)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.baggage_packages.map((p, i) => (
              <tr key={i}>
                <td className="py-1 pr-4">
                  <input
                    type="number" min={1} max={100} required aria-label={`Gói ${i + 1}: số kg`} className={inputClass}
                    value={p.kg}
                    onChange={(e) => setPath((f) => ((f.baggage_packages[i].kg = e.target.value), f))}
                  />
                </td>
                <td className="py-1 pr-4">
                  <input
                    type="number" min={0} step={1000} required aria-label={`Gói ${i + 1}: giá`} className={inputClass}
                    value={p.price}
                    onChange={(e) => setPath((f) => ((f.baggage_packages[i].price = e.target.value), f))}
                  />
                  {p.price !== "" && Number.isFinite(Number(p.price)) && (
                    <span className="ml-2 text-xs text-ink/50">{fmt.format(Number(p.price))}đ</span>
                  )}
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() => setPath((f) => (f.baggage_packages.splice(i, 1), f))}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {form.baggage_packages.length === 0 && (
          <p className="mt-2 text-xs text-ink/60">Chưa có gói nào — khách sẽ không mua thêm được hành lý ký gửi.</p>
        )}
        <button
          type="button"
          disabled={form.baggage_packages.length >= MAX_PACKAGES}
          onClick={() => setPath((f) => (f.baggage_packages.push({ kg: "", price: "" }), f))}
          className="mt-3 rounded-lg border border-sea-500 px-3 py-1.5 text-xs font-medium text-sea-700 hover:bg-sea-50 disabled:opacity-50"
        >
          + Thêm gói
        </button>
      </section>

      <section className="rounded-xl border border-sand-100 bg-white p-4">
        <h2 className="font-semibold text-sea-900">Suất ăn</h2>
        <div className="mt-3 flex flex-wrap gap-6">
          {CLASSES.map((c) => (
            <div key={c.key} className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink/60">{c.label}</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.meal_included[c.key] === true}
                  onChange={(e) => setPath((f) => ((f.meal_included[c.key] = e.target.checked), f))}
                  className="h-4 w-4 accent-coral-500"
                />
                Đã gồm trong vé (miễn phí)
              </label>
              {form.meal_included[c.key] ? (
                <p className="text-sm text-ink/60">Khách hạng này không phải trả tiền suất ăn.</p>
              ) : (
                <Field label="Giá suất ăn" suffix="đ">
                  <input
                    type="number" min={0} step={1000} required
                    aria-label={`Giá suất ăn ${c.label}`} className={inputClass}
                    value={form.meal_price[c.key]}
                    onChange={(e) => setPath((f) => ((f.meal_price[c.key] = e.target.value), f))}
                  />
                </Field>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-sea-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
        >
          {pending ? "Đang lưu..." : "Lưu bảng giá"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            setForm(toFormState(initialPricing));
          }}
          className="text-sm font-medium text-ink/60 hover:underline"
        >
          Hoàn tác thay đổi
        </button>
        {message && (
          <p role={message.type === "error" ? "alert" : "status"} className={`text-sm ${message.type === "error" ? "text-danger" : "text-sea-700"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
