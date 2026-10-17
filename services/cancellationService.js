const Flight = require("../models/Flight");
const Booking = require("../models/Booking");
const seatService = require("./seatService");
const { hoursUntil, nowVN } = require("../lib/timezone");
const {
  CANCELLATION_FULL_REFUND_THRESHOLD_HOURS,
  CANCELLATION_FIXED_FEE_THRESHOLD_HOURS,
  CANCELLATION_FEES,
} = require("../config/constants");

class CancellationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** Mốc hủy theo số giờ còn lại tới giờ bay (âm = đã khởi hành): "early" | "mid" | "late". */
function cancellationWindow(elapsedHours) {
  if (elapsedHours >= CANCELLATION_FULL_REFUND_THRESHOLD_HOURS) return "early";
  if (elapsedHours >= CANCELLATION_FIXED_FEE_THRESHOLD_HOURS) return "mid";
  return "late";
}

/** Hạng ghế của hành khách trên 1 chặng (thiếu dữ liệu -> coi như phổ thông). */
function seatClassOn(passenger, flightId) {
  const seat = (passenger.seats || []).find((s) => String(s.flight_id) === String(flightId));
  return seat?.seat_class === "business" ? "business" : "economy";
}

/** Phần tiền của từng hành khách trong các chặng `legs` — chia `leg.amount`. */
function passengerShares({ booking, flightMap, legs }) {
  const pax = booking.passengers;
  const shares = pax.map(() => 0);
  for (const leg of legs) {
    const flightDoc = flightMap[String(leg.flight_id)];
    const weights = pax.map((p) => {
      const seat = (p.seats || []).find((s) => String(s.flight_id) === String(leg.flight_id));
      const base = seat && flightDoc?.base_price ? flightDoc.base_price[seat.seat_class] ?? 0 : 0;
      return base + (seat?.addons_amount || 0);
    });
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let allocated = 0;
    pax.forEach((_, i) => {
      const part =
        i === pax.length - 1
          ? leg.amount - allocated
          : totalWeight > 0
            ? Math.floor((leg.amount * weights[i]) / totalWeight)
            : Math.floor(leg.amount / pax.length);
      shares[i] += part;
      allocated += part;
    });
  }
  return shares;
}

/** Bảng phí hủy (ghi chú j) — tính cho từng hành khách theo hạng ghế của khách và mốc giờ hủy. */
function computeCancellationFee(elapsedHours, passengers) {
  const window = cancellationWindow(elapsedHours);
  let amount = 0;
  let fee = 0;
  for (const p of passengers) {
    const rule = CANCELLATION_FEES[p.seatClass] ?? CANCELLATION_FEES.economy;
    const perPax = rule[window] === null ? p.share : Math.min(rule[window], p.share);
    amount += p.share;
    fee += perPax;
  }
  const refund = amount - fee;
  const tier = fee === 0 ? "full" : refund === 0 ? "none" : "fixed_fee";
  return { tier, fee, refund, window };
}

/** Phí hủy cho các chặng `legs` của booking, mốc giờ theo chuyến `refFlightId`. */
function feeForLegs({ booking, flightMap, legs, refFlightId, now }) {
  const shares = passengerShares({ booking, flightMap, legs });
  const passengers = booking.passengers.map((p, i) => ({ seatClass: seatClassOn(p, refFlightId), share: shares[i] }));
  const elapsedHours = hoursUntil(flightMap[String(refFlightId)].departure_time, now);
  return computeCancellationFee(elapsedHours, passengers);
}

/** Ghi chú (l): chặn hủy nếu bất kỳ ghế nào trong booking đã check-in. */
function assertNoCheckedInSeat(booking, flightMap) {
  const hasCheckedIn = booking.passengers.some((p) =>
    p.seats.some((s) => {
      const flightDoc = flightMap[String(s.flight_id)];
      const seatDoc = flightDoc && flightDoc.seats.find((fs) => fs.seat_number === s.seat_number);
      return seatDoc ? seatDoc.checked_in === true : false;
    })
  );
  if (hasCheckedIn) {
    throw new CancellationError(
      "Booking có hành khách đã check-in, không thể hủy vé.",
      409
    );
  }
}

/** Trả về map { [flightId]: FlightDoc } cho danh sách flight_id trong booking. */
async function loadFlightMap(booking) {
  const flightIds = booking.flights.map((f) => f.flight_id);
  const flightDocs = await Flight.find({ _id: { $in: flightIds } });
  return Object.fromEntries(flightDocs.map((f) => [String(f._id), f]));
}

/** Nhả toàn bộ ghế của booking thuộc các flight_id chỉ định (mặc định: tất cả chặng). */
async function releaseBookingSeats(booking, onlyFlightIds = null) {
  const targetIds = onlyFlightIds ? onlyFlightIds.map(String) : null;
  for (const passenger of booking.passengers) {
    for (const seat of passenger.seats) {
      if (targetIds && !targetIds.includes(String(seat.flight_id))) continue;
      // userId: booking.user_id — forceReleaseSeat bắt buộc khớp held_by (xem comment ở services/seatService.js).
      await seatService.forceReleaseSeat({
        flightId: seat.flight_id,
        seatNumber: seat.seat_number,
        userId: booking.user_id,
      });
    }
  }
}

/** C9 (khách tự hủy) / A3. */
async function cancelBooking({ bookingId, cancelReason }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new CancellationError("Không tìm thấy booking.", 404);
  }

  // --- Nhánh 1 (ghi chú g): chưa thanh toán → hủy ngay, không có gì để hoàn ---
  if (booking.status === "pending_payment") {
    // Ghi status trước bằng update có điều kiện (atomic), chỉ nhả ghế nếu thắng.
    const result = await Booking.updateOne(
      { _id: booking._id, status: "pending_payment" },
      { $set: { status: "cancelled", cancel_reason: cancelReason } }
    );
    if (result.modifiedCount === 0) {
      throw new CancellationError(
        "Trạng thái booking vừa thay đổi (có thể vừa thanh toán xong). Vui lòng tải lại trang.",
        409
      );
    }
    await releaseBookingSeats(booking); // ghế đang held (chưa từng thành booked)
    return await Booking.findById(booking._id);
  }

  if (booking.status !== "confirmed") {
    throw new CancellationError(
      `Booking đang ở trạng thái '${booking.status}', không thể hủy qua luồng này.`,
      409
    );
  }

  // --- Nhánh 2 (ghi chú g): đã thanh toán → tính refund_amount theo mốc thời gian ---
  const flightMap = await loadFlightMap(booking);
  assertNoCheckedInSeat(booking, flightMap); // ghi chú l — cần flightMap để tra Flight.seats[].checked_in

  const now = nowVN().toDate();
  const plan = planCancellation({ booking, flightMap, now });

  // Chốt trạng thái bằng update có điều kiện (atomic) trước khi nhả ghế: 2 request hủy đồng thời.
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "confirmed" },
    {
      $set: {
        status: "refunded",
        cancellation_tier: plan.tier,
        cancellation_fee_amount: plan.fee,
        refund_amount: plan.refund,
        refund_processed_at: now,
        cancel_reason: cancelReason,
      },
    },
    { returnDocument: "after" }
  );
  if (!claimed) {
    throw new CancellationError(
      "Trạng thái booking vừa thay đổi (có thể đã được hủy hoặc xử lý ở nơi khác). Vui lòng tải lại trang.",
      409
    );
  }

  await releaseBookingSeats(claimed, plan.releaseFlightIds);
  return claimed;
}

/** Hàm thuần (không đụng DB) — quyết định mức phí/hoàn tiền và ghế cần nhả khi khách/admin hủy 1 booking… */
function planCancellation({ booking, flightMap, now }) {
  if (booking.trip_type === "one_way") {
    const leg = booking.flights[0];
    // Ghi chú (j): <3h kể cả khi chuyến đã khởi hành vẫn áp mốc "late" (không chặn hủy).
    const { tier, fee, refund } = feeForLegs({ booking, flightMap, legs: booking.flights, refFlightId: leg.flight_id, now });
    return { tier, fee, refund, releaseFlightIds: null };
  }

  // round_trip — ghi chú (w): 3 trường hợp theo departure_time chặng đi/chặng về
  const outboundLeg = booking.flights.find((f) => f.leg === "outbound");
  const returnLeg = booking.flights.find((f) => f.leg === "return");
  const outboundFlight = flightMap[String(outboundLeg.flight_id)];
  const returnFlight = flightMap[String(returnLeg.flight_id)];

  if (now < outboundFlight.departure_time) {
    // TH1 — chưa chặng nào bay: mốc giờ + hạng ghế theo chặng đi, trên toàn bộ số tiền booking
    const { tier, fee, refund } = feeForLegs({ booking, flightMap, legs: booking.flights, refFlightId: outboundLeg.flight_id, now });
    return { tier, fee, refund, releaseFlightIds: null };
  }
  if (now < returnFlight.departure_time) {
    // TH2 — chặng đi đã bay, chặng về chưa: mốc giờ + hạng ghế theo chặng về, chỉ trên tiền chặng về
    const { fee, refund } = feeForLegs({ booking, flightMap, legs: [returnLeg], refFlightId: returnLeg.flight_id, now });
    // ghi chú w — tier "partial", ghi đè, không dùng tier gốc của bảng
    return { tier: "partial", fee, refund, releaseFlightIds: [returnLeg.flight_id] };
  }
  // TH3 — cả 2 chặng đã bay: không còn gì để hủy
  throw new CancellationError("Hành trình đã hoàn tất, không thể hủy vé.", 409);
}

/** Hàm thuần — tiền hoàn khi hãng hủy chuyến `cancelledFlightId` (A8). */
function computeBulkRefund({ booking, flightMap, cancelledFlightId, now }) {
  const alreadyFlownAmount = booking.flights.reduce((sum, leg) => {
    if (String(leg.flight_id) === String(cancelledFlightId)) return sum;
    const flightDoc = flightMap[String(leg.flight_id)];
    return flightDoc && flightDoc.departure_time <= now ? sum + leg.amount : sum;
  }, 0);
  const refundAmount = booking.total_amount - alreadyFlownAmount;
  return {
    refundAmount,
    // Phần không hoàn (nếu có) là tiền hãng đã thực thu hợp lệ cho chặng đã bay.
    feeAmount: booking.total_amount - refundAmount,
    tier: refundAmount === booking.total_amount ? "full" : "partial",
  };
}

/** A8 — hủy hàng loạt mọi booking liên quan 1 chuyến bay bị hủy do lỗi hãng. */
async function cancelBookingsForFlight({ flightId, cancelReason }) {
  if (!cancelReason) {
    throw new CancellationError("cancel_reason là bắt buộc khi hủy hàng loạt.", 400);
  }

  const bookings = await Booking.find({
    "flights.flight_id": flightId,
    status: { $in: ["pending_payment", "confirmed"] },
  });

  const now = nowVN().toDate();
  const affectedIds = [];

  for (let booking of bookings) {
    if (booking.status === "pending_payment") {
      // Chưa thu tiền, không có gì để hoàn.
      const result = await Booking.updateOne(
        { _id: booking._id, status: "pending_payment" },
        { $set: { status: "cancelled", cancel_reason: cancelReason } }
      );
      if (result.modifiedCount === 1) {
        await releaseBookingSeats(booking);
        affectedIds.push(String(booking._id));
        continue;
      }
      // Thua race: VNPay vừa xác nhận thanh toán -> đọc lại, xử lý như booking "confirmed" bên dưới.
      booking = await Booking.findById(booking._id);
      if (!booking || booking.status !== "confirmed") continue;
    }

    // status === "confirmed"
    const flightMap = await loadFlightMap(booking);
    const { refundAmount, feeAmount, tier } = computeBulkRefund({
      booking,
      flightMap,
      cancelledFlightId: flightId,
      now,
    });

    // Chốt atomic (chỉ khi vẫn `confirmed`) — tránh ghi đè nếu khách vừa tự hủy cùng lúc.
    const claimed = await Booking.findOneAndUpdate(
      { _id: booking._id, status: "confirmed" },
      {
        $set: {
          status: "refunded",
          refund_amount: refundAmount,
          cancellation_fee_amount: feeAmount,
          cancellation_tier: tier,
          refund_processed_at: now,
          cancel_reason: cancelReason,
        },
      },
      { returnDocument: "after" }
    );
    if (!claimed) continue;

    // Nhả toàn bộ ghế của booking (không chỉ chặng bị hủy): cả booking chuyển 'refunded', chặng còn lại.
    await releaseBookingSeats(claimed);
    affectedIds.push(String(claimed._id));
  }

  return affectedIds;
}

/** Cron job (ghi chú f) — quét `Booking.payment.payment_expires_at` đã quá hạn ở trạng thái `pending_payment`. */
async function cancelExpiredPendingPayments() {
  const now = nowVN().toDate();
  const expiredBookings = await Booking.find({
    status: "pending_payment",
    "payment.payment_expires_at": { $lt: now },
  });

  let cancelledCount = 0;
  for (const booking of expiredBookings) {
    // Booking đã có giao dịch VNPay gắn vào (tiền đã trừ) mà vẫn kẹt pending.
    if (booking.payment?.transaction_id) {
      const flagged = await Booking.updateOne(
        { _id: booking._id, status: "pending_payment", "payment.transaction_id": { $ne: null } },
        { $set: { status: "payment_error_manual_refund" } }
      );
      if (flagged.modifiedCount === 1) {
        console.error(`[cron] Booking ${booking._id} quá hạn nhưng đã có giao dịch VNPay — chuyển xử lý tay.`);
      }
      continue;
    }
    // Ghi status trước bằng update có điều kiện (atomic) rồi chỉ nhả ghế nếu thắng race.
    const result = await Booking.updateOne(
      { _id: booking._id, status: "pending_payment", "payment.transaction_id": null },
      {
        $set: {
          status: "cancelled",
          cancel_reason: "Tự động hủy do quá hạn thanh toán.",
        },
      }
    );
    if (result.modifiedCount === 0) {
      console.log(`[cron] Booking ${booking._id} đã được xử lý bởi luồng khác, bỏ qua.`);
      continue;
    }
    await releaseBookingSeats(booking);
    cancelledCount += 1;
  }
  return cancelledCount;
}

/** A3 (ngoại lệ duy nhất cho admin nhập tay số tiền, xem ghi chú y). */
function computeManualRefund(totalAmount, refundAmount) {
  const refund = Number(refundAmount);
  if (!Number.isInteger(refund) || refund <= 0) {
    throw new CancellationError("refund_amount phải là số nguyên dương (đồng).", 400);
  }
  if (refund > totalAmount) {
    throw new CancellationError(
      `refund_amount (${refund}) không được lớn hơn tổng tiền khách đã thanh toán (${totalAmount}).`,
      400
    );
  }
  return {
    refund,
    fee: totalAmount - refund,
    tier: refund === totalAmount ? "full" : "partial",
  };
}

/** A3 — admin xử lý tay 1 booking `payment_error_manual_refund`: ghi số tiền hoàn, chuyển `refunded`. */
async function resolveManualRefund({ bookingId, refundAmount, note }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new CancellationError("Không tìm thấy booking.", 404);
  }
  if (booking.status !== "payment_error_manual_refund") {
    throw new CancellationError(
      `Chỉ xử lý tay được booking ở trạng thái 'payment_error_manual_refund' (hiện là '${booking.status}'). Booking đã thanh toán bình thường phải hủy qua PATCH /api/bookings/[id]/cancel.`,
      409
    );
  }

  const { refund, fee, tier } = computeManualRefund(booking.total_amount, refundAmount);
  const cleanNote = typeof note === "string" ? note.trim() : "";

  const updated = await Booking.findOneAndUpdate(
    { _id: bookingId, status: "payment_error_manual_refund" },
    {
      $set: {
        status: "refunded",
        refund_amount: refund,
        cancellation_fee_amount: fee,
        cancellation_tier: tier,
        refund_processed_at: nowVN().toDate(),
        cancel_reason:
          "Lỗi thanh toán (ghế không còn khi VNPay báo thành công) — admin hoàn tiền thủ công." +
          (cleanNote ? ` Ghi chú: ${cleanNote}` : ""),
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) {
    throw new CancellationError("Booking vừa được xử lý bởi thao tác khác, vui lòng tải lại.", 409);
  }

  for (const passenger of updated.passengers) {
    for (const seat of passenger.seats) {
      await seatService.releaseBookedSeatOwnedBy({
        flightId: seat.flight_id,
        seatNumber: seat.seat_number,
        userId: updated.user_id,
      });
    }
  }

  return updated;
}

module.exports = {
  CancellationError,
  planCancellation,
  computeBulkRefund,
  computeCancellationFee,
  cancellationWindow,
  passengerShares,
  computeManualRefund,
  resolveManualRefund,
  cancelBooking,
  cancelBookingsForFlight,
  cancelExpiredPendingPayments,
};
