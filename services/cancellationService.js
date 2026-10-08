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
      // userId: booking.user_id — forceReleaseSeat bắt buộc khớp held_by
      // (xem comment ở services/seatService.js), tránh nhả nhầm ghế của
      // booking khác nếu ghế này đã đổi chủ từ lúc booking hiện tại tạo.
      await seatService.forceReleaseSeat({
        flightId: seat.flight_id,
        seatNumber: seat.seat_number,
        userId: booking.user_id,
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
    // Ghi status TRƯỚC bằng update có điều kiện (atomic), CHỈ nhả ghế nếu thắng.
    // Trước đây: nhả ghế rồi booking.save() (đọc-sửa-ghi, không điều kiện) —
    // nếu webhook Momo xác nhận thanh toán đúng lúc này, save() có thể ghi đè
    // "confirmed" thành "cancelled" VÀ ghế đã bị nhả dù tiền đã thu. Thứ tự
    // cũng quan trọng: nếu nhả ghế trước rồi mới phát hiện thua race, ghế của
    // booking đã confirmed sẽ bị nhả oan.
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

  for (let booking of bookings) {
    if (booking.status === "pending_payment") {
      // Chưa thu tiền, không có gì để hoàn. Nhả TOÀN BỘ ghế của booking (cả
      // chặng không liên quan tới flightId này nếu là khứ hồi) — vì booking
      // không hỗ trợ hủy tách chặng, cả booking chuyển 'cancelled' nên chặng
      // còn lại (nếu có) cũng không còn hiệu lực, ghế phải được trả lại.
      // Ghi status có điều kiện TRƯỚC, chỉ nhả ghế nếu thắng race với webhook.
      const result = await Booking.updateOne(
        { _id: booking._id, status: "pending_payment" },
        { $set: { status: "cancelled", cancel_reason: cancelReason } }
      );
      if (result.modifiedCount === 1) {
        await releaseBookingSeats(booking);
        affectedIds.push(String(booking._id));
        continue;
      }
      // Thua race: Momo vừa xác nhận thanh toán -> đọc lại, xử lý như booking
      // "confirmed" bên dưới (hoàn tiền) thay vì bỏ sót.
      booking = await Booking.findById(booking._id);
      if (!booking || booking.status !== "confirmed") continue;
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

  let cancelledCount = 0;
  for (const booking of expiredBookings) {
    // Ghi status TRƯỚC bằng update có điều kiện (atomic) rồi CHỈ nhả ghế nếu
    // thắng race. Nếu webhook Momo vừa chuyển booking sang "confirmed", điều
    // kiện status: "pending_payment" không còn khớp -> không ghi đè VÀ không
    // nhả ghế (ghế lúc này đã "booked" hợp lệ của booking đã thu tiền).
    const result = await Booking.updateOne(
      { _id: booking._id, status: "pending_payment" },
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

/**
 * A3 (ngoại lệ duy nhất cho admin nhập tay số tiền, xem ghi chú y) — tính các field
 * hoàn tiền cho booking `payment_error_manual_refund`. Hàm THUẦN để test được.
 *
 * Admin nhập `refundAmount` = số tiền thực sự hoàn lại khách (thường = toàn bộ số đã trừ).
 * Phần chênh (nếu admin cố ý hoàn ít hơn) ghi vào `cancellation_fee_amount` để báo cáo
 * doanh thu A6 vẫn khớp công thức "doanh thu = confirmed + phí phạt của refunded".
 *
 * @throws {CancellationError} 400 nếu số tiền không phải số nguyên dương hoặc vượt `totalAmount`
 */
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

/**
 * A3 — admin xử lý tay 1 booking `payment_error_manual_refund`: ghi số tiền hoàn,
 * chuyển `refunded`, nhả các ghế còn `booked` đúng bởi chủ booking này (ghế đã thuộc
 * người khác thì để nguyên — xem seatService.releaseBookedSeatOwnedBy).
 *
 * Giống toàn bộ luồng hoàn tiền khác: hệ thống chỉ GHI NHẬN số tiền, chưa gọi API hoàn
 * tiền của Momo — admin tự chuyển trả khách ngoài hệ thống rồi ghi nhận ở đây.
 *
 * Atomic: điều kiện `status: payment_error_manual_refund` nằm ngay trong query ghi,
 * 2 admin bấm cùng lúc thì chỉ 1 người thành công.
 *
 * @param {Object} params
 * @param {String} params.bookingId
 * @param {Number|String} params.refundAmount
 * @param {String} [params.note] - ghi chú của admin (VD "Đã chuyển khoản lại ngày ...")
 * @returns {Promise<Object>} Booking doc sau khi cập nhật
 */
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
          "Lỗi thanh toán (ghế không còn khi Momo báo thành công) — admin hoàn tiền thủ công." +
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
  computeFeeBucket,
  computeManualRefund,
  resolveManualRefund,
  cancelBooking,
  cancelBookingsForFlight,
  cancelExpiredPendingPayments,
};
