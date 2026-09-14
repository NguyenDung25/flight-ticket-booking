// services/cancellationService.js
//
// Gộp 2 luồng hủy vé KHÁC BẢN CHẤT nhưng dùng chung field trên Booking
// (refund_amount, cancellation_fee_amount, cancellation_tier, refund_processed_at
// — ghi chú x):
// 1) cancelBooking()          — C9 (khách tự hủy) / A3 (admin hủy thay mặt khách),
//                                khách/admin CHỦ ĐỘNG xin hủy → có thể bị phạt (ghi chú j/w).
// 2) cancelBookingsForFlight() — A8, hãng bay hủy chuyến do lỗi khách quan →
//                                KHÔNG phạt khách, chỉ trừ phần chặng đã bay xong.
//
// Không dùng MongoDB Transaction (mục 10) — mỗi Booking được xử lý độc lập,
// atomic ở cấp field của chính document đó qua .save().

const Flight = require("../models/Flight");
const Booking = require("../models/Booking");
const seatService = require("./seatService");
const { hoursUntil, nowVN } = require("../lib/timezone");
const {
  CANCELLATION_FULL_REFUND_THRESHOLD_HOURS,
  CANCELLATION_FIXED_FEE_THRESHOLD_HOURS,
  CANCELLATION_FIXED_FEE_PER_PASSENGER,
} = require("../config/constants");

class CancellationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Bảng mốc phí hủy cố định (ghi chú j), áp dụng cho MỘT phần tiền cụ thể
 * (toàn `total_amount` ở TH1/vé 1 chiều, hoặc riêng `flights[chặng về].amount`
 * ở TH2). Trả về tier THEO ĐÚNG BẢNG GỐC — nơi gọi hàm này tự quyết định có
 * ghi đè thành `partial` hay không (xem ghi chú w, chỉ TH2 mới ghi đè).
 *
 * @param {Number} elapsedHours - giờ còn lại tới departure_time mốc (có thể âm nếu đã qua giờ bay)
 * @param {Number} passengerCount
 * @param {Number} amount - phần tiền bị áp mốc
 */
function computeFeeBucket(elapsedHours, passengerCount, amount) {
  if (elapsedHours >= CANCELLATION_FULL_REFUND_THRESHOLD_HOURS) {
    return { tier: "full", fee: 0, refund: amount };
  }
  if (elapsedHours >= CANCELLATION_FIXED_FEE_THRESHOLD_HOURS) {
    // Trừ thẳng, KHÔNG để refund âm nếu total_amount nhỏ hơn mức phạt cố định
    const fee = Math.min(CANCELLATION_FIXED_FEE_PER_PASSENGER * passengerCount, amount);
    return { tier: "fixed_fee", fee, refund: amount - fee };
  }
  // < 3 tiếng, KỂ CẢ khi departure_time đã qua (elapsedHours âm) — vẫn phạt 100%,
  // không phải "chặn hủy" (đó là quy tắc khác — ghi chú l, chỉ áp khi đã check-in)
  return { tier: "none", fee: amount, refund: 0 };
}

/**
 * Ghi chú (l): chặn hủy nếu bất kỳ ghế nào trong booking đã check-in.
 *
 * QUAN TRỌNG: `checked_in` KHÔNG nằm trên `Booking.passengers[].seats[]` —
 * trường này chỉ tồn tại ở `Flight.seats[]` (đúng theo mongodb-schema-design.md
 * mục 5). Phải tra cứu qua `flightMap` (Flight doc thật), không được check
 * trực tiếp trên sub-document của Booking — nếu không, điều kiện luôn `false`
 * và rào chặn này sẽ không bao giờ có tác dụng.
 */
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
      await seatService.forceReleaseSeat({
        flightId: seat.flight_id,
        seatNumber: seat.seat_number,
      });
    }
  }
}

/**
 * C9 (khách tự hủy) / A3 (admin hủy thay mặt khách — dùng CHUNG hàm này,
 * không có API riêng để sửa status thành 'refunded' trực tiếp).
 *
 * @param {String} bookingId
 * @param {String} cancelReason
 * @returns {Promise<Object>} Booking doc sau khi hủy
 */
async function cancelBooking({ bookingId, cancelReason }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new CancellationError("Không tìm thấy booking.", 404);
  }

  // --- Nhánh 1 (ghi chú g): chưa thanh toán → hủy ngay, không có gì để hoàn ---
  if (booking.status === "pending_payment") {
    await releaseBookingSeats(booking); // ghế đang held (chưa từng thành booked)
    booking.status = "cancelled";
    booking.cancel_reason = cancelReason;
    await booking.save();
    return booking;
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
  const passengerCount = booking.passengers.length;

  if (booking.trip_type === "one_way") {
    const leg = booking.flights[0];
    const flightDoc = flightMap[String(leg.flight_id)];
    const elapsedHours = hoursUntil(flightDoc.departure_time, now);
    const { tier, fee, refund } = computeFeeBucket(elapsedHours, passengerCount, booking.total_amount);

    booking.cancellation_tier = tier;
    booking.cancellation_fee_amount = fee;
    booking.refund_amount = refund;
    await releaseBookingSeats(booking); // chỉ có 1 chặng — nhả toàn bộ
  } else {
    // round_trip — ghi chú (w): 3 trường hợp theo departure_time chặng đi/chặng về
    const outboundLeg = booking.flights.find((f) => f.leg === "outbound");
    const returnLeg = booking.flights.find((f) => f.leg === "return");
    const outboundFlight = flightMap[String(outboundLeg.flight_id)];
    const returnFlight = flightMap[String(returnLeg.flight_id)];

    if (now < outboundFlight.departure_time) {
      // TH1 — chưa chặng nào bay: áp mốc theo chặng đi, trên toàn total_amount
      const elapsedHours = hoursUntil(outboundFlight.departure_time, now);
      const { tier, fee, refund } = computeFeeBucket(elapsedHours, passengerCount, booking.total_amount);
      booking.cancellation_tier = tier;
      booking.cancellation_fee_amount = fee;
      booking.refund_amount = refund;
      await releaseBookingSeats(booking); // cả 2 chặng
    } else if (now < returnFlight.departure_time) {
      // TH2 — chặng đi đã bay, chặng về chưa: áp mốc theo chặng về, CHỈ trên flights[return].amount
      const elapsedHours = hoursUntil(returnFlight.departure_time, now);
      const { fee, refund } = computeFeeBucket(elapsedHours, passengerCount, returnLeg.amount);
      booking.cancellation_tier = "partial"; // ghi chú w — ghi đè, không dùng tier gốc của bucket
      booking.cancellation_fee_amount = fee;
      booking.refund_amount = refund;
      await releaseBookingSeats(booking, [returnLeg.flight_id]); // chỉ nhả ghế chặng về
    } else {
      // TH3 — cả 2 chặng đã bay: không còn gì để hủy
      throw new CancellationError("Hành trình đã hoàn tất, không thể hủy vé.", 409);
    }
  }

  booking.status = "refunded";
  booking.refund_processed_at = now;
  booking.cancel_reason = cancelReason;
  await booking.save();
  return booking;
}

/**
 * A8 — hủy hàng loạt mọi booking liên quan 1 chuyến bay bị hủy do lỗi hãng.
 * KHÔNG áp phí phạt (khác hẳn cancelBooking ở trên) — chỉ trừ phần chặng đã
 * bay xong nếu là vé khứ hồi (ghi chú A8). Bỏ qua rào cản check-in (ghi chú l
 * chỉ áp dụng khi khách chủ động xin hủy).
 *
 * @returns {Promise<Array<String>>} danh sách booking_id đã bị ảnh hưởng
 */
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

  for (const booking of bookings) {
    if (booking.status === "pending_payment") {
      // Chưa thu tiền, không có gì để hoàn. Nhả TOÀN BỘ ghế của booking (cả
      // chặng không liên quan tới flightId này nếu là khứ hồi) — vì booking
      // không hỗ trợ hủy tách chặng, cả booking chuyển 'cancelled' nên chặng
      // còn lại (nếu có) cũng không còn hiệu lực, ghế phải được trả lại.
      await releaseBookingSeats(booking);
      booking.status = "cancelled";
      booking.cancel_reason = cancelReason;
      await booking.save();
      affectedIds.push(String(booking._id));
      continue;
    }

    // status === "confirmed"
    const flightMap = await loadFlightMap(booking);
    const alreadyFlownAmount = booking.flights.reduce((sum, leg) => {
      const flightDoc = flightMap[String(leg.flight_id)];
      return flightDoc && flightDoc.departure_time <= now ? sum + leg.amount : sum;
    }, 0);

    const refundAmount = booking.total_amount - alreadyFlownAmount;
    booking.refund_amount = refundAmount;
    // Phần không hoàn (nếu có) là tiền hãng đã thực thu hợp lệ cho chặng đã bay
    // — lưu vào cancellation_fee_amount để A6 cộng đúng vào doanh thu, dù đây
    // không phải "phí phạt" theo nghĩa thông thường (ghi chú A8, A6).
    booking.cancellation_fee_amount = booking.total_amount - refundAmount;
    booking.cancellation_tier = refundAmount === booking.total_amount ? "full" : "partial";
    booking.status = "refunded";
    booking.refund_processed_at = now;
    booking.cancel_reason = cancelReason;

    // Nhả TOÀN BỘ ghế của booking (không chỉ chặng bị hủy) — cùng lý do như
    // nhánh pending_payment ở trên: cả booking chuyển 'refunded', chặng còn
    // lại (nếu khứ hồi và không bị hủy) không còn gắn với booking hợp lệ nào
    // nữa nên ghế của nó cũng phải được trả lại kho, dù bản thân chuyến bay
    // đó vẫn khai thác bình thường.
    await releaseBookingSeats(booking);

    await booking.save();
    affectedIds.push(String(booking._id));
  }

  return affectedIds;
}

/**
 * Cron job (ghi chú f) — quét `Booking.payment.payment_expires_at` đã quá
 * hạn ở trạng thái `pending_payment`, tự chuyển `cancelled` và nhả ghế.
 * KHÁC với `cancelBooking()` ở trên: đây là khách bỏ ngang CHƯA TỪNG thanh
 * toán (không có tiền để tính hoàn), không phải khách chủ động hủy đơn đã
 * thanh toán — nên không tính `refund_amount`/`cancellation_fee_amount`.
 *
 * Gọi định kỳ từ `cron/releaseExpiredHolds.js` (hoặc tiến trình cron riêng),
 * độc lập với việc nhả ghế quá hạn ở `seatService.releaseExpiredHolds()` —
 * 2 việc này xử lý 2 vấn đề khác nhau dù cùng hệ quả "nhả ghế".
 *
 * @returns {Promise<Number>} số booking đã bị hủy tự động
 */
async function cancelExpiredPendingPayments() {
  const now = nowVN().toDate();
  const expiredBookings = await Booking.find({
    status: "pending_payment",
    "payment.payment_expires_at": { $lt: now },
  });

  for (const booking of expiredBookings) {
    await releaseBookingSeats(booking);
    booking.status = "cancelled";
    booking.cancel_reason = "Tự động hủy do quá hạn thanh toán.";
    await booking.save();
  }

  return expiredBookings.length;
}

module.exports = {
  CancellationError,
  computeFeeBucket,
  cancelBooking,
  cancelBookingsForFlight,
  cancelExpiredPendingPayments,
};
