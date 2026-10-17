"use client";

import { useEffect, useRef, useState } from "react";
import { MIN_AGE_REQUIRE_ID_DOCUMENT } from "@/config/constants";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SeatMap from "./SeatMap";
import { normalizeContactEmail, normalizePhone } from "@/lib/bookingContact";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";
import { baggageOptions, baggagePrice, checkedBaggageAllowance, priceAddons } from "@/lib/ancillaries";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

/** Bản client-side của lib/timezone.js ageInYears() — không import trực tiếp file đó. */
function ageInYearsLocal(dateOfBirth) {
  const birth = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// Ngày hôm nay theo giờ máy khách (dạng YYYY-MM-DD) làm `max` cho ô ngày sinh.
function todayLocalISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyPassenger() {
  return {
    localId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Math.random()),
    full_name: "",
    document_type: "cccd",
    document_id: "",
    date_of_birth: "",
    seatByLeg: { outbound: null, return: null },
    // Dịch vụ bổ sung theo chặng (lib/ancillaries.js) — giá thật do server tính lại khi tạo booking.
    addonsByLeg: { outbound: emptyAddons(), return: emptyAddons() },
  };
}

function emptyAddons() {
  return { baggage_kg: 0, meal: false };
}

async function apiCall(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(localizeApiMessage(data.message, currentUiLocale()) || "Request failed");
    // 409 từ POST /api/bookings: đã có booking chờ thanh toán chứa cùng ghế — kèm id để tiếp tục thanh toán.
    if (data.existing_booking_id) err.existingBookingId = data.existing_booking_id;
    throw err;
  }
  return data;
}

export default function PassengersForm({
  locale,
  pricing, // bảng giá dịch vụ bổ sung hiện hành (admin sửa được) — server tính lại khi tạo booking
  defaultContactEmail = "",
  tripType,
  initialPassengerCount,
  outboundFlight,
  returnFlight,
}) {
  const t = useTranslations("Booking");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  // sessionStorage — lưu hành khách + ghế đã chọn để không mất khi thoát trang rồi quay lại.
  const SESSION_KEY = `pf_${outboundFlight._id}`;
  function readPfSession(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function savePfSession(data) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch {}
  }

  const [passengers, setPassengers] = useState(() =>
    Array.from({ length: initialPassengerCount }, emptyPassenger)
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const [outboundSeats, setOutboundSeats] = useState(outboundFlight.seats);
  const [returnSeats, setReturnSeats] = useState(returnFlight ? returnFlight.seats : []);
  const [seatBusy, setSeatBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Người liên hệ: email nhận vé điện tử (mặc định email tài khoản) + số điện thoại.
  const [contact, setContact] = useState({ email: defaultContactEmail, phone: "" });
  // true sau khi đã khôi phục từ sessionStorage — trước đó không tự lưu, kẻo giá trị mặc định ghi đè dữ liệu cũ.
  const [restored, setRestored] = useState(false);

  // Render lần đầu bằng giá trị mặc định (giống server — server không đọc được sessionStorage).
  useEffect(() => {
    const saved = readPfSession(SESSION_KEY, null);
    const id = setTimeout(() => {
      if (saved) {
        if (saved.passengers) setPassengers(saved.passengers);
        if (saved.outboundSeats) setOutboundSeats(saved.outboundSeats);
        if (saved.returnSeats) setReturnSeats(saved.returnSeats);
        if (saved.contact) setContact(saved.contact);
      }
      setRestored(true);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save passengers + seats vào sessionStorage mỗi khi thay đổi.
  useEffect(() => {
    if (!restored) return;
    savePfSession({ passengers, outboundSeats, returnSeats, contact });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, passengers, outboundSeats, returnSeats, contact]);
  const [errorMessage, setErrorMessage] = useState(null);
  // Lỗi (VD ghế vừa bị người khác giữ) hiển thị ở khung dưới cùng.
  const errorRef = useRef(null);
  useEffect(() => {
    if (errorMessage && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [errorMessage]);
  const [createdBookingId, setCreatedBookingId] = useState(null);
  // A5 — mã khuyến mãi (tùy chọn).
  const [promotionCode, setPromotionCode] = useState("");

  function setSeatLocal(leg, seatNumber, patch) {
    const setter = leg === "outbound" ? setOutboundSeats : setReturnSeats;
    setter((prev) => prev.map((s) => (s.seat_number === seatNumber ? { ...s, ...patch } : s)));
  }

  function setPassengerSeat(index, leg, seatNumber) {
    setPassengers((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, seatByLeg: { ...p.seatByLeg, [leg]: seatNumber } } : p
      )
    );
  }

  function seatClassOf(leg, seatNumber) {
    const list = leg === "outbound" ? outboundSeats : returnSeats;
    return list.find((s) => s.seat_number === seatNumber)?.seat_class;
  }

  function callHoldSeat(leg, seatNumber) {
    const flightId = leg === "outbound" ? outboundFlight._id : returnFlight._id;
    return apiCall(`/api/flights/${flightId}/hold-seat`, { seat_number: seatNumber });
  }

  function callReleaseSeat(leg, seatNumber) {
    const flightId = leg === "outbound" ? outboundFlight._id : returnFlight._id;
    return apiCall(`/api/flights/${flightId}/release-seat`, { seat_number: seatNumber });
  }

  // Trạng thái hiển thị của 1 ghế — kết hợp dữ liệu thật.
  function computeLocalStatus(seat, leg) {
    const assignedPassenger = passengers.find((p) => p.seatByLeg[leg] === seat.seat_number);
    if (assignedPassenger) {
      return assignedPassenger.localId === passengers[activeIndex]?.localId
        ? "selected"
        : "takenByOtherPassenger";
    }
    if (seat.status === "available") return "available";
    if (seat.status === "held" && seat.held_by_me) {
      return "mineUnassigned";
    }
    if (seat.status === "held") return "heldByOther";
    return "booked";
  }

  async function handleSeatSelect(leg, seatNumber) {
    setErrorMessage(null);
    const list = leg === "outbound" ? outboundSeats : returnSeats;
    const seat = list.find((s) => s.seat_number === seatNumber);
    const active = passengers[activeIndex];
    if (!seat || !active) return;

    const currentSeatForActive = active.seatByLeg[leg];

    // Bấm lại đúng ghế đang chọn cho hành khách hiện tại -> bỏ chọn.
    if (currentSeatForActive === seatNumber) {
      setSeatBusy(true);
      try {
        await callReleaseSeat(leg, seatNumber);
        setSeatLocal(leg, seatNumber, { status: "available", held_by_me: false });
        setPassengerSeat(activeIndex, leg, null);
      } catch (err) {
        setErrorMessage(err.message);
      } finally {
        setSeatBusy(false);
      }
      return;
    }

    const status = computeLocalStatus(seat, leg);
    if (status !== "available" && status !== "mineUnassigned") return;

    setSeatBusy(true);
    try {
      // Hành khách hiện tại đang giữ 1 ghế khác trên cùng chặng -> nhả trước, mỗi khách chỉ 1 ghế / chặng.
      if (currentSeatForActive) {
        await callReleaseSeat(leg, currentSeatForActive);
        setSeatLocal(leg, currentSeatForActive, { status: "available", held_by_me: false });
      }

      // Luôn gọi hold-seat (kể cả khi state cục bộ nghĩ ghế này "đã là của mình" — status "mineUnassigned").
      await callHoldSeat(leg, seatNumber);
      setSeatLocal(leg, seatNumber, { status: "held", held_by_me: true });

      setPassengerSeat(activeIndex, leg, seatNumber);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setSeatBusy(false);
    }
  }

  function addPassenger() {
    setPassengers((prev) => [...prev, emptyPassenger()]);
  }

  async function removePassenger(index) {
    if (passengers.length <= 1) return;
    const p = passengers[index];
    setSeatBusy(true);
    try {
      // Bắt buộc nhả ghế ngay — không chỉ xóa khỏi state.
      if (p.seatByLeg.outbound) {
        await callReleaseSeat("outbound", p.seatByLeg.outbound).catch((err) => console.error(err));
        setSeatLocal("outbound", p.seatByLeg.outbound, { status: "available", held_by_me: false });
      }
      if (p.seatByLeg.return && returnFlight) {
        await callReleaseSeat("return", p.seatByLeg.return).catch((err) => console.error(err));
        setSeatLocal("return", p.seatByLeg.return, { status: "available", held_by_me: false });
      }
    } finally {
      setPassengers((prev) => prev.filter((_, i) => i !== index));
      setActiveIndex((i) => (i >= index ? Math.max(0, i - 1) : i));
      setSeatBusy(false);
    }
  }

  function updatePassengerAddons(index, leg, patch) {
    setPassengers((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        const current = p.addonsByLeg?.[leg] ?? emptyAddons();
        return { ...p, addonsByLeg: { ...(p.addonsByLeg ?? {}), [leg]: { ...current, ...patch } } };
      })
    );
  }

  // Hạng ghế để tính giá dịch vụ: chưa chọn ghế thì tạm tính như hạng phổ thông.
  function addonsFor(p, leg) {
    const seatClass = seatClassOf(leg, p.seatByLeg[leg]) ?? "economy";
    try {
      return { seatClass, ...priceAddons(p.addonsByLeg?.[leg] ?? emptyAddons(), seatClass, pricing) };
    } catch {
      // Gói đã chọn không còn trong bảng giá (admin vừa sửa) -> coi như không mua thêm.
      return { seatClass, ...priceAddons(emptyAddons(), seatClass, pricing) };
    }
  }

  function updatePassengerField(index, field, value) {
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function validate() {
    if (passengers.length === 0) return t("errorMinPassengers");
    // Cùng luật với server (lib/bookingContact.js) — báo sớm trước khi tạo booking.
    if (!normalizeContactEmail(contact.email)) return t("errorContactEmail");
    if (!normalizePhone(contact.phone)) return t("errorContactPhone");

    const seenDocumentIds = new Map(); // document_id (trim) -> full_name người đầu tiên khai số đó

    for (const p of passengers) {
      if (!p.full_name.trim() || !p.document_type || !p.date_of_birth) {
        return t("errorMissingFields");
      }

      // Khớp đúng luật server (services/bookingValidationService.js validatePassengerDocument).
      if (p.date_of_birth > todayLocalISO()) {
        return t("errorDobFuture");
      }
      const age = ageInYearsLocal(p.date_of_birth);
      if (age >= MIN_AGE_REQUIRE_ID_DOCUMENT) {
        if (!p.document_id.trim() || !["cccd", "passport"].includes(p.document_type)) {
          return t("errorDocumentTypeForAge");
        }
      } else if (p.document_type === "cccd") {
        return t("errorDocumentTypeForAge");
      }

      // Chặn 2 hành khách trong cùng booking khai trùng số giấy tờ — bỏ qua document_id rỗng.
      const trimmedId = p.document_id.trim();
      if (trimmedId) {
        if (seenDocumentIds.has(trimmedId)) {
          return t("errorDuplicateDocumentId");
        }
        seenDocumentIds.set(trimmedId, p.full_name);
      }

      if (!p.seatByLeg.outbound || (returnFlight && !p.seatByLeg.return)) {
        return t("errorMissingSeats");
      }
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      let bookingId = createdBookingId;

      // Nếu bước thanh toán lần trước lỗi (VD VNPay tạm thời không phản hồi), booking đã tồn tại.
      if (!bookingId) {
        const flights = [{ flight_id: outboundFlight._id, leg: "outbound" }];
        if (returnFlight) flights.push({ flight_id: returnFlight._id, leg: "return" });

        const passengersPayload = passengers.map((p) => {
          const seats = [
            {
              flight_id: outboundFlight._id,
              seat_number: p.seatByLeg.outbound,
              seat_class: seatClassOf("outbound", p.seatByLeg.outbound),
              baggage_kg: p.addonsByLeg?.outbound?.baggage_kg ?? 0,
              meal: p.addonsByLeg?.outbound?.meal === true,
            },
          ];
          if (returnFlight) {
            seats.push({
              flight_id: returnFlight._id,
              seat_number: p.seatByLeg.return,
              seat_class: seatClassOf("return", p.seatByLeg.return),
              baggage_kg: p.addonsByLeg?.return?.baggage_kg ?? 0,
              meal: p.addonsByLeg?.return?.meal === true,
            });
          }
          return {
            full_name: p.full_name.trim(),
            document_type: p.document_type,
            document_id: p.document_id.trim(),
            date_of_birth: p.date_of_birth,
            seats,
          };
        });

        const booking = await apiCall("/api/bookings", {
          trip_type: tripType,
          flights,
          passengers: passengersPayload,
          // "" -> undefined: không gửi field rỗng lên server.
          promotion_code: promotionCode.trim() || undefined,
          contact: { email: contact.email.trim(), phone: contact.phone.trim() },
        });
        bookingId = booking._id;
        setCreatedBookingId(bookingId);
        // Xóa session sau khi đặt vé thành công — tránh hiện lại data cũ
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
      }

      const payment = await apiCall(`/api/payments/${bookingId}`, {});
      window.location.href = payment.payUrl;
    } catch (err) {
      // Quay lại từ trang VNPay rồi bấm đặt lần nữa: server chặn booking thứ 2 cùng ghế (409).
      if (err.existingBookingId) {
        const goOn = window.confirm(
          `${err.message}\n\n${t("continuePendingConfirm")}`
        );
        if (goOn) {
          try {
            const payment = await apiCall(`/api/payments/${err.existingBookingId}`, {});
            window.location.href = payment.payUrl;
            return;
          } catch (payErr) {
            setErrorMessage(payErr.message || t("submitError"));
            return;
          }
        }
      }
      setErrorMessage(err.message || t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  const fareTotal = passengers.reduce((sum, p) => {
    let amount = 0;
    if (p.seatByLeg.outbound) {
      amount += outboundFlight.base_price[seatClassOf("outbound", p.seatByLeg.outbound)] ?? 0;
    }
    if (returnFlight && p.seatByLeg.return) {
      amount += returnFlight.base_price[seatClassOf("return", p.seatByLeg.return)] ?? 0;
    }
    return sum + amount;
  }, 0);
  const addonsTotal = passengers.reduce(
    (sum, p) =>
      sum + addonsFor(p, "outbound").addons_amount + (returnFlight ? addonsFor(p, "return").addons_amount : 0),
    0
  );
  const totalAmount = fareTotal + addonsTotal;

  const disabled = seatBusy || submitting;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-sand-50 px-4 py-12 sm:px-16">
      <div className="w-full max-w-3xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-sea-700 hover:underline"
        >
          ← {t("backButton")}
        </button>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          {t("passengerInfoTitle")}
        </h1>
        <p className="mt-1 text-sm text-ink/60">{t("stepLabel")}</p>
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-4">
        {passengers.map((p, index) => (
          <Card
            key={p.localId}
            className={`p-5 ${index === activeIndex ? "ring-2 ring-coral-500" : ""}`}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className="text-sm font-semibold text-sea-900"
              >
                {t("passengerLabel", { index: index + 1 })}
                {index === activeIndex && (
                  <span className="ml-2 text-xs font-normal text-coral-600">
                    ({t("seatSelectionTitle")})
                  </span>
                )}
              </button>
              {passengers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePassenger(index)}
                  disabled={disabled}
                  className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                >
                  {t("removePassenger")}
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={t("fullNameLabel")}
                value={p.full_name}
                onChange={(e) => updatePassengerField(index, "full_name", e.target.value)}
                onFocus={() => setActiveIndex(index)}
              />
              <Select
                label={t("documentTypeLabel")}
                value={p.document_type}
                onChange={(e) => updatePassengerField(index, "document_type", e.target.value)}
                onFocus={() => setActiveIndex(index)}
                options={[
                  { value: "cccd", label: t("documentTypeCccd") },
                  { value: "passport", label: t("documentTypePassport") },
                  { value: "birth_certificate", label: t("documentTypeBirthCertificate") },
                ]}
              />
              <Input
                label={t("documentIdLabel")}
                value={p.document_id}
                onChange={(e) => updatePassengerField(index, "document_id", e.target.value)}
                onFocus={() => setActiveIndex(index)}
              />
              <Input
                type="date"
                max={todayLocalISO()}
                label={t("dateOfBirthLabel")}
                value={p.date_of_birth}
                onChange={(e) => updatePassengerField(index, "date_of_birth", e.target.value)}
                onFocus={() => setActiveIndex(index)}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink/60">
              <span>
                {t("seatLegOutbound")}:{" "}
                <strong className="text-ink">{p.seatByLeg.outbound ?? t("noSeatSelected")}</strong>
              </span>
              {returnFlight && (
                <span>
                  · {t("seatLegReturn")}:{" "}
                  <strong className="text-ink">{p.seatByLeg.return ?? t("noSeatSelected")}</strong>
                </span>
              )}
            </div>

            <div className="mt-4 border-t border-sand-100 pt-3">
              <p className="text-sm font-semibold text-sea-700">{t("addonsTitle")}</p>
              <div className={`mt-2 grid gap-3 ${returnFlight ? "sm:grid-cols-2" : ""}`}>
                {(returnFlight ? ["outbound", "return"] : ["outbound"]).map((leg) => {
                  const a = addonsFor(p, leg);
                  return (
                    <div key={leg} className="flex flex-col gap-2 rounded-lg bg-sand-50 p-3">
                      <p className="text-xs font-medium text-ink">
                        {leg === "outbound" ? t("seatLegOutbound") : t("seatLegReturn")}
                      </p>
                      <p className="text-xs text-ink/60">
                        {t("baggageIncluded", { carryOn: pricing.carry_on_kg, checked: checkedBaggageAllowance(a.seatClass, 0, pricing) })}
                      </p>
                      <Select
                        label={t("baggageLabel")}
                        value={String(p.addonsByLeg?.[leg]?.baggage_kg ?? 0)}
                        onChange={(e) => updatePassengerAddons(index, leg, { baggage_kg: Number(e.target.value) })}
                        onFocus={() => setActiveIndex(index)}
                        disabled={disabled}
                        options={baggageOptions(pricing).map((kg) => ({
                          value: String(kg),
                          label:
                            kg === 0
                              ? t("baggageNone")
                              : t("baggageOption", { kg, price: CURRENCY_FORMATTER.format(baggagePrice(kg, pricing)) }),
                        }))}
                      />
                      {pricing.meal_included[a.seatClass] ? (
                        <p className="text-xs text-sea-700">✓ {t("mealIncluded")}</p>
                      ) : (
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={p.addonsByLeg?.[leg]?.meal === true}
                            onChange={(e) => updatePassengerAddons(index, leg, { meal: e.target.checked })}
                            disabled={disabled}
                            className="h-4 w-4 accent-coral-500"
                          />
                          {t("mealOption", { price: CURRENCY_FORMATTER.format(pricing.meal_price[a.seatClass]) })}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        ))}

        <Button variant="secondary" onClick={addPassenger} disabled={disabled} className="self-start">
          + {t("addPassenger")}
        </Button>
      </div>

      {/* Cho biết ghế đang chọn sẽ gán cho ai — trên điện thoại. */}
      <p className="w-full max-w-3xl text-sm text-ink/70">
        {t("selectingSeatFor")}:{" "}
        <strong className="text-coral-600">
          {passengers[activeIndex]?.full_name.trim() || t("passengerLabel", { index: activeIndex + 1 })}
        </strong>
        {seatBusy && <span className="ml-2 text-xs text-ink/50">{t("processing")}</span>}
      </p>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold text-ink">{t("seatLegOutbound")}</p>
          <SeatMap
            seats={outboundSeats.map((s) => ({ ...s, localStatus: computeLocalStatus(s, "outbound") }))}
            onSelect={(seatNumber) => handleSeatSelect("outbound", seatNumber)}
            disabled={disabled}
            legendT={t}
          />
        </Card>
        {returnFlight && (
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold text-ink">{t("seatLegReturn")}</p>
            <SeatMap
              seats={returnSeats.map((s) => ({ ...s, localStatus: computeLocalStatus(s, "return") }))}
              onSelect={(seatNumber) => handleSeatSelect("return", seatNumber)}
              disabled={disabled}
              legendT={t}
            />
          </Card>
        )}
      </div>

      <Card className="w-full max-w-3xl p-5">
        {errorMessage && (
          <p ref={errorRef} role="alert" className="mb-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <div className="mb-4">
          <p className="text-sm font-semibold text-ink">{t("contactTitle")}</p>
          <p className="mt-0.5 text-xs text-ink/60">{t("contactHint")}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Input
              id="contact-email"
              type="email"
              label={t("contactEmail")}
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              autoComplete="email"
              maxLength={254}
              disabled={disabled}
            />
            <Input
              id="contact-phone"
              type="tel"
              label={t("contactPhone")}
              placeholder={t("contactPhonePlaceholder")}
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              autoComplete="tel"
              maxLength={20}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="mb-4">
          <Input
            label={t("promotionCodeLabel")}
            placeholder={t("promotionCodePlaceholder")}
            value={promotionCode}
            onChange={(e) => setPromotionCode(e.target.value.toUpperCase())}
            disabled={disabled}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-ink/60">{t("totalAmountLabel")}</p>
            <p className="text-xl font-semibold text-coral-600">
              {CURRENCY_FORMATTER.format(totalAmount)}đ
            </p>
            {addonsTotal > 0 && (
              <p className="text-xs text-ink/60">
                {t("fareAndAddons", {
                  fare: CURRENCY_FORMATTER.format(fareTotal),
                  addons: CURRENCY_FORMATTER.format(addonsTotal),
                })}
              </p>
            )}
            {promotionCode.trim() && (
              <p className="mt-1 text-xs text-coral-600 font-medium">{t("promotionAppliedNote")}</p>
            )}
          </div>
          <Button onClick={handleSubmit} disabled={disabled}>
            {submitting ? t("processing") : t("continueToPayment")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
