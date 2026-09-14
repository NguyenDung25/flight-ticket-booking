// services/bookingValidationService.js
//
// Toàn bộ validate "phụ thuộc dữ liệu khác" của Booking đặt ở đây, gọi từ API
// tạo booking (POST /api/bookings, C6) TRƯỚC khi ghi vào DB. Không tin dữ liệu
// client cho bất kỳ giá trị nào ảnh hưởng tới tiền (ghi chú o) hay giấy tờ (ghi chú aa).

const Flight = require("../models/Flight");
const { ageInYears } = require("../lib/timezone");
const {
  MIN_AGE_REQUIRE_ID_DOCUMENT,
  MIN_ROUND_TRIP_TRANSIT_MS,
} = require("../config/constants");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Ghi chú (aa): validate document_type/document_id theo độ tuổi.
 * - >=14 tuổi: bắt buộc có document_id, document_type phải là cccd|passport.
 * - <14 tuổi: chấp nhận birth_certificate, không ép cấu trúc document_id.
 * KHÔNG ảnh hưởng amount — giá vé vẫn tính phẳng theo seat_class (mục 6, ngoài phạm vi).
 */
function validatePassengerDocument(passenger) {
  const age = ageInYears(passenger.date_of_birth);

  if (age >= MIN_AGE_REQUIRE_ID_DOCUMENT) {
    if (!passenger.document_id) {
      throw new ValidationError(
        `Hành khách "${passenger.full_name}" từ ${MIN_AGE_REQUIRE_ID_DOCUMENT} tuổi trở lên bắt buộc phải nhập số giấy tờ tùy thân.`
      );
    }
    if (!["cccd", "passport"].includes(passenger.document_type)) {
      throw new ValidationError(
        `Hành khách "${passenger.full_name}" từ ${MIN_AGE_REQUIRE_ID_DOCUMENT} tuổi trở lên phải dùng CCCD hoặc Hộ chiếu.`
      );
    }
  } else {
    // Dưới 14 tuổi: cho phép birth_certificate, document_id có thể là mã định
    // danh cá nhân hoặc số quyển giấy khai sinh — không ép đủ 12 số như CCCD.
    if (passenger.document_type === "cccd") {
      throw new ValidationError(
        `Hành khách "${passenger.full_name}" dưới ${MIN_AGE_REQUIRE_ID_DOCUMENT} tuổi không thể dùng CCCD, chọn Giấy khai sinh hoặc Hộ chiếu.`
      );
    }
  }
}

/**
 * Ghi chú (z): validate khoảng cách transit tối thiểu 2 tiếng giữa chặng đi và
 * chặng về cho vé khứ hồi. Lớp bảo vệ cuối ở service — UI (C3 bước 2) nên lọc
 * trước nhưng không được bỏ qua bước này.
 */
function validateRoundTripTransit(outboundFlight, returnFlight) {
  const gap = new Date(returnFlight.departure_time) - new Date(outboundFlight.arrival_time);
  if (gap < MIN_ROUND_TRIP_TRANSIT_MS) {
    throw new ValidationError(
      "Chặng về cất cánh quá sớm so với giờ hạ cánh chặng đi (cần tối thiểu 2 tiếng transit). Vui lòng chọn lại chặng về."
    );
  }
}

/**
 * Ghi chú (o): đối chiếu seat_class client gửi lên với seat_class THẬT trong
 * Flight.seats[seat_number] — không tin dữ liệu client vì ảnh hưởng trực tiếp
 * tới cách tính amount.
 */
function assertSeatClassMatches(flightDoc, seatNumber, claimedSeatClass) {
  const realSeat = flightDoc.seats.find((s) => s.seat_number === seatNumber);
  if (!realSeat) {
    throw new ValidationError(
      `Ghế ${seatNumber} không tồn tại trên chuyến bay ${flightDoc.flight_number}.`
    );
  }
  if (realSeat.seat_class !== claimedSeatClass) {
    throw new ValidationError(
      `seat_class client gửi (${claimedSeatClass}) không khớp dữ liệu thật (${realSeat.seat_class}) cho ghế ${seatNumber}.`
    );
  }
  return realSeat;
}

/**
 * MỚI THÊM: xác minh ghế đang thực sự `held` bởi ĐÚNG user đang tạo booking
 * này — bắt buộc phải qua bước hold-seat (C5) trước, không được bỏ qua.
 *
 * Lý do bắt buộc có bước này: nếu thiếu, 1 client có thể gửi thẳng request
 * tạo booking với 1 seat_number đang `available` (chỉ cần đoán đúng
 * seat_class) mà KHÔNG cần gọi hold-seat trước — booking `pending_payment`
 * vẫn được tạo bình thường vì assertSeatClassMatches không quan tâm status
 * ghế. Lỗi chỉ lộ ra SAU KHI Momo đã trừ tiền thật, ở bước
 * seatService.confirmSeatBooked (điều kiện status: held, held_by: userId sẽ
 * fail vì ghế chưa từng được hold) → booking rơi oan vào
 * `payment_error_manual_refund` dù đáng ra phải bị chặn ngay từ lúc tạo
 * booking, không phải đợi tới lúc thanh toán xong mới phát hiện.
 */
function assertSeatIsHeldByUser(flightDoc, seatNumber, userId) {
  const seat = flightDoc.seats.find((s) => s.seat_number === seatNumber);
  if (!seat || seat.status !== "held" || String(seat.held_by) !== String(userId)) {
    throw new ValidationError(
      `Ghế ${seatNumber} chưa được bạn giữ hợp lệ (có thể đã hết hạn giữ ghế hoặc bị người khác giữ). Vui lòng chọn lại ghế.`,
      409
    );
  }
}

/**
 * Ghi chú (t): flights[i].amount = Σ (theo từng hành khách có seats[] chứa
 * flight_id = flights[i].flight_id) base_price[seat_class_của_khách_đó].
 *
 * @param {Array} passengers - passengers[] của Booking (đã có seats[] đầy đủ)
 * @param {String} flightId - _id của Flight (leg) cần tính amount
 * @param {Object} basePriceByFlightId - map { [flightId]: { economy, business } }
 */
function computeLegAmount(passengers, flightId, basePriceByFlightId) {
  const basePrice = basePriceByFlightId[flightId];
  let amount = 0;
  for (const passenger of passengers) {
    const seatOnThisLeg = passenger.seats.find(
      (s) => String(s.flight_id) === String(flightId)
    );
    if (seatOnThisLeg) {
      amount += basePrice[seatOnThisLeg.seat_class];
    }
  }
  return amount;
}

/**
 * Hàm tổng hợp gọi khi tạo booking (C6). Ném ValidationError nếu có bất kỳ vi
 * phạm nào — API route bắt lỗi này và trả về đúng statusCode + message.
 *
 * @param {Object} params
 * @param {Array} params.passengers - dữ liệu hành khách client gửi lên
 * @param {Array} params.legs - [{ flightDoc, leg: 'outbound'|'return' }]
 * @param {String} params.userId - chủ booking, dùng đối chiếu held_by (MỚI THÊM)
 */
async function validateBookingCreation({ passengers, legs, userId }) {
  // 1) Validate giấy tờ theo độ tuổi cho từng hành khách
  for (const passenger of passengers) {
    validatePassengerDocument(passenger);
  }

  // 2) Validate transit time nếu khứ hồi
  if (legs.length === 2) {
    const outbound = legs.find((l) => l.leg === "outbound");
    const returnLeg = legs.find((l) => l.leg === "return");
    validateRoundTripTransit(outbound.flightDoc, returnLeg.flightDoc);
  }

  // 3) Đối chiếu seat_class thật + xác minh ghế đang được CHÍNH user này giữ
  // cho từng ghế mỗi hành khách đã chọn (ghi chú o + bước MỚI THÊM ở trên).
  const flightById = Object.fromEntries(legs.map((l) => [String(l.flightDoc._id), l.flightDoc]));
  for (const passenger of passengers) {
    for (const seat of passenger.seats) {
      const flightDoc = flightById[String(seat.flight_id)];
      assertSeatClassMatches(flightDoc, seat.seat_number, seat.seat_class);
      assertSeatIsHeldByUser(flightDoc, seat.seat_number, userId);
    }
  }

  // 4) Tính amount từng chặng (dùng lại ở nơi gọi để build flights[] của Booking)
  const basePriceByFlightId = Object.fromEntries(
    legs.map((l) => [String(l.flightDoc._id), l.flightDoc.base_price])
  );
  const amounts = {};
  for (const l of legs) {
    amounts[String(l.flightDoc._id)] = computeLegAmount(
      passengers,
      l.flightDoc._id,
      basePriceByFlightId
    );
  }

  return { amounts };
}

module.exports = {
  ValidationError,
  validatePassengerDocument,
  validateRoundTripTransit,
  assertSeatClassMatches,
  assertSeatIsHeldByUser,
  computeLegAmount,
  validateBookingCreation,
};