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

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import SeatMap from "./SeatMap";

const CURRENCY_FORMATTER = new Intl.NumberFormat("vi-VN");

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

  const [passengers, setPassengers] = useState(() =>
    Array.from({ length: initialPassengerCount }, emptyPassenger)
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [outboundSeats, setOutboundSeats] = useState(outboundFlight.seats);
  const [returnSeats, setReturnSeats] = useState(returnFlight ? returnFlight.seats : []);
  const [seatBusy, setSeatBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [createdBookingId, setCreatedBookingId] = useState(null);

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

      if (status === "available") {
        await callHoldSeat(leg, seatNumber);
        setSeatLocal(leg, seatNumber, { status: "held", held_by_me: true });
      }
      // status === "mineUnassigned": ghế này mình đã giữ từ trước (VD tải
      // lại trang giữa chừng) — chỉ cần gán cho khách hiện tại, KHÔNG gọi
      // hold-seat lại (ghế đã held bởi đúng mình, gọi lại sẽ dư thừa).

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
    for (const p of passengers) {
      if (!p.full_name.trim() || !p.document_type || !p.document_id.trim() || !p.date_of_birth) {
        return t("errorMissingFields");
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
        });
        bookingId = booking._id;
        setCreatedBookingId(bookingId);
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
          <p role="alert" className="mb-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-ink/60">{t("totalAmountLabel")}</p>
            <p className="text-xl font-semibold text-coral-600">
              {CURRENCY_FORMATTER.format(totalAmount)}đ
            </p>
          </div>
          <Button onClick={handleSubmit} disabled={disabled}>
            {submitting ? t("processing") : t("continueToPayment")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
