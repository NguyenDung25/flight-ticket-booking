"use client";

// app/[locale]/check-in/BoardingPass.jsx
//
// C10 — thẻ lên máy bay sau khi check-in: thông tin chuyến/ghế, mã QR, nút In / Lưu PDF và hướng dẫn
// tại sân bay. Nhãn theo `Booking.locale` (lib/boardingPass.js), KHÔNG theo ngôn ngữ giao diện —
// cùng quy tắc với vé điện tử (C7).

import { useMemo, useRef } from "react";
import Button from "@/components/ui/Button";
import { toVN } from "@/lib/timezone";
import { boardingPassLabels, boardingQrSvg } from "@/lib/boardingPass";

function PassField({ label, value, strong = false }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink/50">{label}</p>
      <p className={`mt-0.5 text-sm text-ink ${strong ? "font-semibold" : ""}`}>{value}</p>
    </div>
  );
}

export default function BoardingPass({ item }) {
  const L = boardingPassLabels(item.bookingLocale);
  const departure = toVN(item.departureTime);
  const boarding = toVN(item.boardingTime);
  const passRef = useRef(null);
  // SVG do thư viện qrcode-generator sinh — chỉ gồm các ô vuông, không chứa văn bản người dùng nhập.
  const qrSvg = useMemo(() => boardingQrSvg(item), [item]);

  // In đúng 1 thẻ: đánh dấu thẻ này để CSS @media print (globals.css) chỉ in phần được đánh dấu.
  function handlePrint() {
    const el = passRef.current;
    if (!el) return;
    el.setAttribute("data-print-target", "true");
    const cleanup = () => {
      el.removeAttribute("data-print-target");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <div>
      <div
        ref={passRef}
        className="boarding-pass overflow-hidden rounded-lg border border-dashed border-sea-700/40 bg-white"
      >
        <div className="flex items-center justify-between gap-2 bg-sea-700 px-4 py-2 text-white">
          <p className="text-sm font-semibold uppercase tracking-wide">{L.boarding_pass}</p>
          <p className="font-mono text-sm">{item.flightNumber}</p>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3">
              <PassField label={L.passenger} value={item.passengerName} strong />
            </div>
            <PassField label={L.booking_code} value={item.bookingCode || "—"} strong />
            <PassField label={L.flight} value={item.flightNumber} />
            <PassField label={L.seat} value={item.seatNumber} strong />
            <PassField label={L.from} value={item.originCode} strong />
            <PassField label={L.to} value={item.destCode} strong />
            <PassField label={L.seat_class} value={item.seatClass === "business" ? L.business : L.economy} />
            <div className="col-span-2">
              <PassField
                label={L.baggage}
                value={`${L.baggage_value(item.carryOnKg ?? 7, item.checkedBaggageKg ?? 0)}${item.meal ? ` · ${L.meal}` : ""}`}
              />
            </div>
            <PassField label={L.departure} value={departure.format("HH:mm DD/MM/YYYY")} />
            <PassField label={L.boarding_time} value={boarding.format("HH:mm")} strong />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink/50">{L.boarding_pass_code}</p>
              <p className="mt-0.5 font-mono text-sm font-bold tracking-widest text-ink">{item.boardingPassCode}</p>
            </div>
          </div>
          <div
            role="img"
            aria-label={L.qr_alt}
            className="mx-auto h-36 w-36 shrink-0 sm:mx-0"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </div>
        <div className="border-t border-dashed border-sea-700/30 px-4 py-3 text-xs text-ink/70">
          <p className="font-semibold text-sea-900">{L.guide_title}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>{(item.checkedBaggageKg ?? 0) > 0 ? L.guide_with_bag : L.guide_no_bag}</li>
            <li>{L.guide_arrive}</li>
            <li>{L.gate_note}</li>
          </ul>
          {item.checkedInAt && (
            <p className="mt-2 text-ink/50">
              {L.checked_in_at}: {toVN(item.checkedInAt).format("HH:mm DD/MM/YYYY")}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="secondary" onClick={handlePrint}>
          {L.print}
        </Button>
      </div>
    </div>
  );
}
