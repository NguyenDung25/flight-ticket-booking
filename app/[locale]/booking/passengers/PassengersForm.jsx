"use client";

// app/[locale]/booking/passengers/PassengersForm.jsx
//
// C4+C5 gộp 1 màn hình — khách nhập hành khách và chọn ghế cho từng chặng
// CÙNG LÚC (đúng đặc tả C4). Mọi ghế hiển thị "đã chọn" ở đây là TRẠNG THÁI
// UI CỤC BỘ ghép giữa dữ liệu ghế thật từ server (status/held_by) và việc
// "ghế nào đang gán cho hành khách nào trong form" (server không biết khái
// niệm "hành khách" cho tới khi POST /api/bookings) — xem computeLocalStatus.
//
// Side-effect BẮT BUỘC khi xóa hành khách đã lỡ chọn ghế (đúng ghi chú C4):
// gọi ngay release-seat cho MỌI ghế người đó đang giữ, không chỉ xóa khỏi
// state — xem removePassenger().

import { useEffect, useRef, useState } from "react";
import { MIN_AGE_REQUIRE_ID_DOCUMENT } from "@/config/constants";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SeatMap from "./SeatMap";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

/**
 * Bản client-side của lib/timezone.js ageInYears() — KHÔNG import trực tiếp
 * file đó (server-only, kéo theo các hằng số C10 không liên quan tới form
 * này). Tuổi chỉ cần chính xác tới NGÀY — input type="date" cho sẵn
 * "YYYY-MM-DD" nên không có rủi ro lệch múi giờ như khi so departure_time.
 */
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

// Ngày hôm nay theo giờ MÁY KHÁCH (dạng YYYY-MM-DD) làm `max` cho ô ngày sinh —
// không dùng toISOString() vì nó ra ngày UTC, sáng sớm giờ VN sẽ lùi 1 ngày.
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
  };
}

async function apiCall(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export default function PassengersForm({
  locale,
  tripType,
  initialPassengerCount,
  outboundFlight,
  returnFlight,
}) {
  const t = useTranslations("Booking");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  // sessionStorage — lưu hành khách + ghế đã chọn để không mất khi thoát
  // trang rồi quay lại (VD bấm Back từ trang summary). Key gắn với
  // outboundFlight._id để tránh khôi phục nhầm data của chuyến bay khác.
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

  const savedSession = readPfSession(SESSION_KEY, null);

  const [passengers, setPassengers] = useState(() =>
    savedSession?.passengers ?? Array.from({ length: initialPassengerCount }, emptyPassenger)
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const [outboundSeats, setOutboundSeats] = useState(
    savedSession?.outboundSeats ?? outboundFlight.seats
  );
  const [returnSeats, setReturnSeats] = useState(
    savedSession?.returnSeats ?? (returnFlight ? returnFlight.seats : [])
  );
  const [seatBusy, setSeatBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-save passengers + seats vào sessionStorage mỗi khi thay đổi.
  // Đặt SAU khi cả 3 state đã khai báo — const không hoist, dùng trước khai
  // báo sẽ gây ReferenceError runtime.
  useEffect(() => {
    savePfSession({ passengers, outboundSeats, returnSeats });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passengers, outboundSeats, returnSeats]);
  const [errorMessage, setErrorMessage] = useState(null);
  // Lỗi (VD ghế vừa bị người khác giữ) hiển thị ở khung dưới cùng, nhưng khách
  // vừa bấm ghế ở sơ đồ phía trên -> thường không thấy. Tự cuộn tới lỗi mỗi
  // khi có lỗi mới để không bị bỏ sót.
  const errorRef = useRef(null);
  useEffect(() => {
    if (errorMessage && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [errorMessage]);
  const [createdBookingId, setCreatedBookingId] = useState(null);
  // A5 — mã khuyến mãi (tùy chọn). KHÔNG tự gọi API kiểm tra mã lúc gõ (đồ
  // án không cần UX preview realtime) — chỉ gửi kèm khi tạo booking, server
  // (applyPromotion) validate và trả lỗi rõ ràng nếu sai/hết hạn/hết lượt,
  // hiện qua chung errorMessage như mọi lỗi submit khác.
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

  // Trạng thái HIỂN THỊ của 1 ghế — kết hợp dữ liệu thật (status/held_by) với
  // việc ghế đó đã được GÁN cho hành khách nào trong form hiện tại (khái
  // niệm chỉ tồn tại phía client, server chỉ biết "held bởi user X").
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
      // Hành khách hiện tại đang giữ 1 ghế KHÁC trên CÙNG chặng -> nhả
      // trước, mỗi khách chỉ 1 ghế / chặng.
      if (currentSeatForActive) {
        await callReleaseSeat(leg, currentSeatForActive);
        setSeatLocal(leg, currentSeatForActive, { status: "available", held_by_me: false });
      }

      // LUÔN gọi hold-seat (kể cả khi state cục bộ nghĩ ghế này "đã là của
      // mình" — status "mineUnassigned") — KHÔNG tự đoán trạng thái cũ trên
      // client rồi bỏ qua gọi API. Lý do: state "mineUnassigned" tính từ
      // dữ liệu tải lúc vào trang, có thể đã CŨ (VD ghế đã bị server tự nhả
      // vì hết hạn 30 phút trong lúc người dùng còn đang ở trên trang) —
      // hold-seat() phía server giờ đã idempotent (xem services/seatService.js),
      // gọi lại luôn an toàn: nếu ghế thật sự vẫn đang là của mình thì chỉ
      // refresh held_until; nếu đã bị nhả thì giữ lại như hold mới, không
      // silently coi là "đã giữ" trong khi thực ra không còn giữ gì cả.
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
      // BẮT BUỘC nhả ghế ngay — không chỉ xóa khỏi state (xem comment đầu file).
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

  function updatePassengerField(index, field, value) {
    setPassengers((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function validate() {
    if (passengers.length === 0) return t("errorMinPassengers");

    const seenDocumentIds = new Map(); // document_id (trim) -> full_name người đầu tiên khai số đó

    for (const p of passengers) {
      if (!p.full_name.trim() || !p.document_type || !p.date_of_birth) {
        return t("errorMissingFields");
      }

      // Khớp ĐÚNG luật server (services/bookingValidationService.js
      // validatePassengerDocument): document_id CHỈ bắt buộc từ
      // MIN_AGE_REQUIRE_ID_DOCUMENT tuổi trở lên — dưới tuổi đó, khai sinh
      // hợp lệ dù không có document_id.
      const age = ageInYearsLocal(p.date_of_birth);
      if (age >= MIN_AGE_REQUIRE_ID_DOCUMENT) {
        if (!p.document_id.trim() || !["cccd", "passport"].includes(p.document_type)) {
          return t("errorDocumentTypeForAge");
        }
      } else if (p.document_type === "cccd") {
        return t("errorDocumentTypeForAge");
      }

      // MỚI THÊM: chặn 2 hành khách trong cùng booking khai TRÙNG số giấy
      // tờ — bỏ qua document_id rỗng (trẻ dưới tuổi bắt buộc, hợp lệ không
      // điền), KHÔNG coi 2 ô rỗng là "trùng nhau". Server
      // (validateNoDuplicateDocumentIds) validate lại y hệt, đây chỉ để báo
      // lỗi sớm ngay trên form.
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

      // Nếu bước thanh toán lần trước lỗi (VD Momo tạm thời không phản hồi),
      // booking ĐÃ tồn tại — chỉ retry thanh toán, KHÔNG tạo booking lần 2.
      if (!bookingId) {
        const flights = [{ flight_id: outboundFlight._id, leg: "outbound" }];
        if (returnFlight) flights.push({ flight_id: returnFlight._id, leg: "return" });

        const passengersPayload = passengers.map((p) => {
          const seats = [
            {
              flight_id: outboundFlight._id,
              seat_number: p.seatByLeg.outbound,
              seat_class: seatClassOf("outbound", p.seatByLeg.outbound),
            },
          ];
          if (returnFlight) {
            seats.push({
              flight_id: returnFlight._id,
              seat_number: p.seatByLeg.return,
              seat_class: seatClassOf("return", p.seatByLeg.return),
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
          // "" -> undefined: KHÔNG gửi field rỗng lên server (route coi
          // promotion_code falsy là "không áp mã", nhưng gửi chuỗi rỗng vẫn
          // falsy nên thực ra vô hại — chỉ để tránh key rác không cần thiết
          // trong request body).
          promotion_code: promotionCode.trim() || undefined,
        });
        bookingId = booking._id;
        setCreatedBookingId(bookingId);
        // Xóa session sau khi đặt vé thành công — tránh hiện lại data cũ
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
      }

      const payment = await apiCall(`/api/payments/${bookingId}`, {});
      window.location.href = payment.payUrl;
    } catch (err) {
      setErrorMessage(err.message || t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  const totalAmount = passengers.reduce((sum, p) => {
    let amount = 0;
    if (p.seatByLeg.outbound) {
      amount += outboundFlight.base_price[seatClassOf("outbound", p.seatByLeg.outbound)] ?? 0;
    }
    if (returnFlight && p.seatByLeg.return) {
      amount += returnFlight.base_price[seatClassOf("return", p.seatByLeg.return)] ?? 0;
    }
    return sum + amount;
  }, 0);

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
        <h1 className="mt-2 font-display text-2xl font-semibold text-sea-900">
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
          </Card>
        ))}

        <Button variant="secondary" onClick={addPassenger} disabled={disabled} className="self-start">
          + {t("addPassenger")}
        </Button>
      </div>

      {/* Cho biết ghế đang chọn sẽ gán cho ai — trên điện thoại, khung nhập
          hành khách nằm xa sơ đồ ghế nên khách dễ không biết mình đang chọn
          cho hành khách nào. */}
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
