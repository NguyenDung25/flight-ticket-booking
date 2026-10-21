"use client";

import { useRef, useState } from "react";

const MAX_BYTES = 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const BTN =
  "rounded-lg border border-sand-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sea-900 transition-colors hover:bg-sea-50 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_DANGER =
  "rounded-lg border border-sand-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40";

function kb(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PopularRoutesAdmin({ initial, airports }) {
  const [routes, setRoutes] = useState(initial.routes);
  const [usingDefaults, setUsingDefaults] = useState(initial.usingDefaults);
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const fileRefs = useRef({});

  const airportByCode = Object.fromEntries(airports.map((a) => [a.code, a]));
  const cityOf = (code) => airportByCode[code]?.city || airportByCode[code]?.label || code;

  async function call(key, url, options) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Có lỗi xảy ra.");
      setRoutes(data.routes);
      setUsingDefaults(data.usingDefaults);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const json = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  async function handleAdd(e) {
    e.preventDefault();
    if (!origin || !dest) return setError("Vui lòng chọn điểm đi và điểm đến.");
    if (origin === dest) return setError("Điểm đi và điểm đến không được trùng nhau.");
    const ok = await call("add", "/api/admin/popular-routes", json("POST", { origin_code: origin, dest_code: dest }));
    if (ok) {
      setOrigin("");
      setDest("");
    }
  }

  async function handleUpload(route, file) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setError("Chỉ nhận ảnh JPG, PNG hoặc WebP.");
    if (file.size > MAX_BYTES) return setError(`Ảnh ${kb(file.size)} quá lớn (tối đa 1 MB).`);
    const form = new FormData();
    form.append("file", file);
    await call(`${route.id}:image`, `/api/admin/popular-routes/${route.id}/image`, { method: "PUT", body: form });
    if (fileRefs.current[route.id]) fileRefs.current[route.id].value = "";
  }

  async function handleDelete(route) {
    if (!window.confirm(`Xóa tuyến ${route.origin_code} → ${route.dest_code} khỏi trang chủ?`)) return;
    await call(`${route.id}:delete`, `/api/admin/popular-routes/${route.id}`, json("DELETE"));
  }

  const selectCls =
    "w-60 rounded-lg border border-sand-100 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sea-500";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink/70">
        Các tuyến hiển thị ở khối “Tuyến bay phổ biến” trên trang chủ khách. Giá “Từ …” và chuyến gần nhất tự lấy từ chuyến
        bay thật (không sửa tay ở đây). Ảnh nền: JPG, PNG hoặc WebP, tối đa 1 MB; tuyến chưa có ảnh dùng hình minh họa.{" "}
        <a href="/" target="_blank" rel="noreferrer" className="font-semibold text-coral-600 underline">
          Xem trang chủ
        </a>
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-rose-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {usingDefaults ? (
        <div className="rounded-xl border border-sand-100 bg-white p-5">
          <p className="text-sm text-ink/80">
            Trang chủ đang dùng <strong>danh sách mặc định</strong> (12 tuyến có sẵn trong hệ thống). Bấm nút dưới để nạp danh
            sách này vào hệ thống rồi bắt đầu thêm, ẩn, sắp xếp và đổi ảnh.
          </p>
          <button
            type="button"
            disabled={busy === "seed"}
            onClick={() => call("seed", "/api/admin/popular-routes/defaults", json("POST"))}
            className="mt-3 rounded-lg bg-coral-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-coral-600 disabled:opacity-60"
          >
            {busy === "seed" ? "Đang nạp…" : "Nạp danh sách mặc định để chỉnh sửa"}
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleAdd} className="rounded-xl border border-sand-100 bg-white p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="pr-origin" className="text-xs font-medium text-ink/70">
                  Điểm đi
                </label>
                <select id="pr-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} className={selectCls}>
                  <option value="">— Chọn sân bay —</option>
                  {airports.filter((a) => a.code !== dest).map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pr-dest" className="text-xs font-medium text-ink/70">
                  Điểm đến
                </label>
                <select id="pr-dest" value={dest} onChange={(e) => setDest(e.target.value)} className={selectCls}>
                  <option value="">— Chọn sân bay —</option>
                  {airports.filter((a) => a.code !== origin).map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={busy === "add"}
                className="rounded-lg bg-coral-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-coral-600 disabled:opacity-60"
              >
                {busy === "add" ? "Đang thêm…" : "Thêm tuyến"}
              </button>
            </div>
          </form>

          <ul className="flex flex-col gap-3">
            {routes.map((r, i) => {
              const locked = busy !== null && busy.startsWith(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-center gap-4 rounded-xl border border-sand-100 bg-white p-3 ${r.active ? "" : "opacity-70"}`}
                >
                  <div
                    aria-hidden="true"
                    className="h-[72px] w-14 shrink-0 rounded-lg bg-gradient-to-b from-amber-200 via-orange-300 to-coral-500 bg-cover bg-center"
                    style={r.has_image ? { backgroundImage: `url(/api/popular-routes/${r.id}/image?v=${r.image_version ?? 0})` } : undefined}
                  />
                  <div className="min-w-[12rem] flex-1">
                    <p className="font-semibold text-sea-900">
                      {i + 1}. {r.origin_code} → {r.dest_code}
                    </p>
                    <p className="text-xs text-ink/70">
                      {cityOf(r.origin_code)} → {cityOf(r.dest_code)}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          r.active ? "bg-green-100 text-success" : "bg-sand-100 text-ink/70"
                        }`}
                      >
                        {r.active ? "Đang hiện" : "Đã ẩn"}
                      </span>
                      <span className="text-ink/70">
                        {r.has_image ? `Có ảnh (${kb(r.image_size ?? 0)})` : "Chưa có ảnh — dùng hình minh họa"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-label="Chuyển lên"
                      disabled={locked || i === 0}
                      onClick={() => call(`${r.id}:up`, `/api/admin/popular-routes/${r.id}`, json("PATCH", { direction: "up" }))}
                      className={BTN}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Chuyển xuống"
                      disabled={locked || i === routes.length - 1}
                      onClick={() => call(`${r.id}:down`, `/api/admin/popular-routes/${r.id}`, json("PATCH", { direction: "down" }))}
                      className={BTN}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => call(`${r.id}:active`, `/api/admin/popular-routes/${r.id}`, json("PATCH", { active: !r.active }))}
                      className={BTN}
                    >
                      {r.active ? "Ẩn" : "Hiện"}
                    </button>
                    <label className={`${BTN} cursor-pointer ${locked ? "pointer-events-none opacity-40" : ""}`}>
                      {r.has_image ? "Đổi ảnh" : "Tải ảnh"}
                      <input
                        ref={(el) => {
                          fileRefs.current[r.id] = el;
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => handleUpload(r, e.target.files?.[0])}
                      />
                    </label>
                    {r.has_image && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => call(`${r.id}:rmimg`, `/api/admin/popular-routes/${r.id}/image`, json("DELETE"))}
                        className={BTN}
                      >
                        Xóa ảnh
                      </button>
                    )}
                    <button type="button" disabled={locked} onClick={() => handleDelete(r)} className={BTN_DANGER}>
                      Xóa tuyến
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink/60">Xóa hết các tuyến thì trang chủ quay về danh sách mặc định.</p>
        </>
      )}
    </div>
  );
}
