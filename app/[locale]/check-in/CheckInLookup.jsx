"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { toVN } from "@/lib/timezone";
import { normalizeBookingCode, normalizePassengerName } from "@/lib/bookingCode";
import BoardingPass from "./BoardingPass";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";

const STEPS = ["search", "select", "rules", "done"];
const ICI_RULES = ["iciRule1", "iciRule2", "iciRule3", "iciRule4", "iciRule5", "iciRule6", "iciRule7"];

const seatKey = (item) => `${item.flightId}:${item.seatNumber}`;

/** Gom ghế theo chặng bay (giữ thứ tự giờ bay mà server đã sắp). */
function groupByFlight(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.flightId)) groups.set(item.flightId, { flight: item, seats: [] });
    groups.get(item.flightId).seats.push(item);
  }
  return [...groups.values()];
}

/** Lý do 1 ghế không chọn được để làm thủ tục (null = chọn được). */
function blockReason(item, t) {
  if (item.checkedIn) return t("alreadyCheckedIn");
  if (item.flightCancelled) return t("flightCancelled");
  if (item.windowState === "not_yet_open") return t("notYetOpen");
  if (item.windowState === "closed") return t("windowClosed");
  return null;
}

function Stepper({ step, t }) {
  const current = STEPS.indexOf(step);
  return (
    <ol className="flex w-full max-w-3xl flex-wrap gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
            i === current ? "bg-sea-700 text-white" : i < current ? "bg-sea-700/15 text-sea-900" : "bg-sand-100 text-ink/50"
          }`}
        >
          <span className="font-semibold">{i + 1}</span>
          {t(`step_${s}`)}
        </li>
      ))}
    </ol>
  );
}

/** Khóa sessionStorage chứa họ hành khách do tab "Làm thủ tục" ở trang chủ chuyển sang. */
export const CHECKIN_PREFILL_KEY = "ci_prefill_name";

export default function CheckInLookup({ initialCode = "" }) {
  const t = useTranslations("CheckIn");
  const [step, setStep] = useState("search");
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  // Mã + họ đã tra cứu thành công (gửi kèm mỗi lần check-in) và danh sách ghế của booking.
  const [auth, setAuth] = useState(null);
  const [items, setItems] = useState([]);
  const [flightId, setFlightId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [agreed, setAgreed] = useState(false);
  const [results, setResults] = useState({ passes: [], failures: [] });

  const groups = useMemo(() => groupByFlight(items), [items]);
  const issuedPasses = items.filter((i) => i.checkedIn);

  async function lookup(bookingCode, passengerName) {
    const res = await fetch("/api/check-in/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_code: bookingCode, passenger_name: passengerName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("lookupError"));
    return data.items;
  }

  // Sang bước 2: mặc định chọn chặng đầu tiên còn ghế làm thủ tục được.
  function openSelect(nextItems) {
    setItems(nextItems);
    const firstOpen = groupByFlight(nextItems).find((g) => g.seats.some((s) => !blockReason(s, t)));
    setFlightId(firstOpen ? firstOpen.flight.flightId : null);
    setSelected(new Set());
    setAgreed(false);
    setStep("select");
  }

  async function runLookup(rawCode, rawName) {
    const normalizedCode = normalizeBookingCode(rawCode);
    if (!normalizedCode) return setError(t("codeInvalid"));
    if (!normalizePassengerName(rawName)) return setError(t("nameRequired"));
    setError(null);
    setLoading(true);
    try {
      const found = await lookup(normalizedCode, rawName);
      setCode(normalizedCode);
      setAuth({ bookingCode: normalizedCode, passengerName: rawName });
      openSelect(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    runLookup(code, name);
  }

  // Đến từ tab "Làm thủ tục" ở trang chủ: mã đặt chỗ trong ?code=, họ hành khách để trong sessionStorage.
  useEffect(() => {
    let prefillName = "";
    try {
      prefillName = sessionStorage.getItem(CHECKIN_PREFILL_KEY) ?? "";
    } catch {}
    if (!initialCode || !prefillName) return undefined;
    const id = setTimeout(() => {
      try { sessionStorage.removeItem(CHECKIN_PREFILL_KEY); } catch {}
      setName(prefillName);
      runLookup(initialCode, prefillName);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSeat(item) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = seatKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function chooseFlight(id) {
    setFlightId(id);
    setSelected(new Set()); // mỗi lần làm thủ tục cho 1 chặng, như website hãng
  }

  async function handleConfirmRules() {
    if (!agreed) return;
    setLoading(true);
    setError(null);
    const chosen = items.filter((i) => selected.has(seatKey(i)));
    const passes = [];
    const failures = [];
    for (const item of chosen) {
      try {
        const res = await fetch(`/api/flights/${item.flightId}/check-in`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seat_number: item.seatNumber,
            booking_code: auth.bookingCode,
            passenger_name: auth.passengerName,
            ici_accepted: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("checkInError"));
        passes.push({
          ...item,
          checkedIn: true,
          boardingPassCode: data.boarding_pass_code,
          checkedInAt: data.checked_in_at,
          boardingTime: data.boarding_time ?? item.boardingTime,
          bookingLocale: data.locale ?? item.bookingLocale,
        });
      } catch (err) {
        failures.push({ item, message: err.message });
      }
    }
    // Cập nhật trạng thái ghế vừa check-in để bước 2 (nếu quay lại) hiển thị đúng.
    setItems((prev) => prev.map((i) => passes.find((p) => seatKey(p) === seatKey(i)) ?? i));
    setResults({ passes, failures });
    setLoading(false);
    setStep("done");
  }

  return (
    <>
      <Stepper step={step} t={t} />

      {step === "search" && (
        <Card className="w-full max-w-3xl p-5">
          <form onSubmit={handleSearch} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <Input
              id="booking-code"
              label={t("codeLabel")}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("codePlaceholder")}
              autoComplete="off"
              maxLength={12}
              className="font-mono tracking-wider"
            />
            <Input
              id="passenger-name"
              label={t("nameLabel")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              autoComplete="family-name"
              maxLength={100}
            />
            <Button type="submit" disabled={loading}>
              {loading ? t("lookingUp") : t("lookupButton")}
            </Button>
          </form>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : (
            <p className="mt-2 text-xs text-ink/50">{t("codeHint")}</p>
          )}
        </Card>
      )}

      {step === "select" && (
        <Card className="w-full max-w-3xl p-5">
          <h2 className="text-lg font-bold tracking-tight text-ink">{t("selectTitle")}</h2>
          <p className="mt-1 text-sm text-ink/60">{t("selectHint", { code: auth.bookingCode })}</p>

          {groups.length === 0 && <p className="mt-4 text-sm text-ink/60">{t("noItems")}</p>}

          <div className="mt-4 flex flex-col gap-4">
            {groups.map(({ flight, seats }) => {
              const openSeats = seats.filter((s) => !blockReason(s, t));
              const active = flightId === flight.flightId;
              return (
                <fieldset
                  key={flight.flightId}
                  className={`rounded-lg border p-4 ${active ? "border-sea-700 bg-white" : "border-sand-100"}`}
                >
                  <legend className="sr-only">{flight.flightNumber}</legend>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="flight"
                      className="mt-1"
                      checked={active}
                      disabled={openSeats.length === 0}
                      onChange={() => chooseFlight(flight.flightId)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-ink">
                        {flight.flightNumber} · {flight.originCode} → {flight.destCode}
                      </span>
                      <span className="block text-xs text-ink/60">
                        {toVN(flight.departureTime).format("HH:mm · DD/MM/YYYY")}
                        {openSeats.length === 0 && ` · ${blockReason(seats[0], t)}`}
                      </span>
                    </span>
                  </label>

                  <ul className="mt-3 flex flex-col gap-2 pl-7">
                    {seats.map((seat) => {
                      const reason = blockReason(seat, t);
                      return (
                        <li key={seatKey(seat)}>
                          <label className={`flex items-center gap-3 text-sm ${reason || !active ? "text-ink/50" : "text-ink"}`}>
                            <input
                              type="checkbox"
                              checked={selected.has(seatKey(seat))}
                              disabled={Boolean(reason) || !active}
                              onChange={() => toggleSeat(seat)}
                            />
                            <span className="font-medium">{seat.passengerName}</span>
                            <span className="text-xs">
                              {t("seatNumber")} {seat.seatNumber}
                              {reason && ` · ${reason}`}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => setStep("search")}>
              {t("back")}
            </Button>
            <div className="flex flex-wrap gap-3">
              {issuedPasses.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setResults({ passes: issuedPasses, failures: [] });
                    setStep("done");
                  }}
                >
                  {t("viewIssued", { count: issuedPasses.length })}
                </Button>
              )}
              <Button onClick={() => setStep("rules")} disabled={selected.size === 0}>
                {t("continue")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "rules" && (
        <Card className="w-full max-w-3xl p-5">
          <h2 className="text-lg font-bold tracking-tight text-ink">{t("iciTitle")}</h2>
          <p className="mt-1 text-sm text-ink/60">{t("iciIntro")}</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink/80">
            {ICI_RULES.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ol>
          <label className="mt-4 flex items-start gap-3 rounded-lg bg-sand-100/60 p-3 text-sm text-ink">
            <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>{t("iciAgree")}</span>
          </label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => setStep("select")} disabled={loading}>
              {t("back")}
            </Button>
            <Button onClick={handleConfirmRules} disabled={!agreed || loading}>
              {loading ? t("checkingIn") : t("agreeContinue")}
            </Button>
          </div>
        </Card>
      )}

      {step === "done" && (
        <div className="flex w-full max-w-3xl flex-col gap-4">
          {results.failures.map(({ item, message }) => (
            <p key={seatKey(item)} role="alert" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
              {item.passengerName} · {item.flightNumber} · {item.seatNumber}: {message}
            </p>
          ))}
          {results.passes.map((item) => (
            <BoardingPass key={seatKey(item)} item={item} />
          ))}
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="secondary" onClick={() => openSelect(items)}>
              {t("backToBooking")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
