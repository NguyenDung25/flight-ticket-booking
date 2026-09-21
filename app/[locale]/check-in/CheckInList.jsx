"use client";

// app/[locale]/check-in/CheckInList.jsx
//
// C10 — mỗi item = 1 ghế của 1 booking `confirmed`. 3 trạng thái hiển thị:
// đã check-in (thẻ lên máy bay), đủ điều kiện (nút check-in), hoặc ngoài
// khung giờ (chỉ hiển thị, WINDOW mở/đóng dựa trên dữ liệu server-side lúc
// tải trang — API vẫn tự đối chiếu lại khung giờ THỰC TẾ lúc bấm, xem
// page.js).

import { useState } from "react";
import { useTranslations } from "next-intl";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { toVN } from "@/lib/timezone";

function itemKey(item) {
  return `${item.bookingId}:${item.flightId}:${item.seatNumber}`;
}

function BoardingPassBlock({ item, t }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-sea-700/30 bg-white/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-sea-700">
        {t("boardingPassCode")}
      </p>
      <p className="mt-1 font-mono text-lg font-bold tracking-widest text-ink">
        {item.boardingPassCode}
      </p>
      {item.checkedInAt && (
        <p className="mt-1 text-xs text-ink/50">
          {t("checkedInAtLabel")}: {toVN(item.checkedInAt).format("HH:mm DD/MM/YYYY")}
        </p>
      )}
    </div>
  );
}

function CheckInCard({ item, onCheckedIn, t, tFlightDetail }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const departure = toVN(item.departureTime);
  const seatClassLabel =
    item.seatClass === "business" ? tFlightDetail("businessLabel") : tFlightDetail("economyLabel");

  async function handleCheckIn() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/flights/${item.flightId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat_number: item.seatNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || t("checkInError"));
      }
      onCheckedIn({
        checkedIn: true,
        boardingPassCode: data.boarding_pass_code,
        checkedInAt: data.checked_in_at,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">
            {item.flightNumber} · {item.originCode} → {item.destCode}
          </p>
          <p className="mt-1 text-xs text-ink/60">{departure.format("HH:mm · DD/MM/YYYY")}</p>
        </div>
        <div className="text-right text-xs text-ink/60">
          <p>
            {t("passengerLabel")}: <span className="text-ink">{item.passengerName}</span>
          </p>
          <p className="mt-0.5">
            {t("seatNumber")}: <span className="font-semibold text-ink">{item.seatNumber}</span> ·{" "}
            {seatClassLabel}
          </p>
        </div>
      </div>

      {item.checkedIn ? (
        <BoardingPassBlock item={item} t={t} />
      ) : item.windowOpen ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button onClick={handleCheckIn} disabled={loading} className="ml-auto">
            {loading ? t("checkingIn") : t("checkInButton")}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink/50">
          {new Date(item.departureTime) > new Date() ? t("notYetOpen") : t("windowClosed")}
        </p>
      )}
    </Card>
  );
}

export default function CheckInList({ initialItems }) {
  const t = useTranslations("CheckIn");
  const tFlightDetail = useTranslations("FlightDetail");
  const [items, setItems] = useState(initialItems);

  function handleCheckedIn(key, patch) {
    setItems((prev) => prev.map((item) => (itemKey(item) === key ? { ...item, ...patch } : item)));
  }

  if (items.length === 0) {
    return <p className="text-sm text-ink/60">{t("noItems")}</p>;
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {items.map((item) => (
        <CheckInCard
          key={itemKey(item)}
          item={item}
          onCheckedIn={(patch) => handleCheckedIn(itemKey(item), patch)}
          t={t}
          tFlightDetail={tFlightDetail}
        />
      ))}
    </div>
  );
}
