// services/bookingValidationService.js
//
// Toàn bộ validate "phụ thuộc dữ liệu khác" của Booking đặt ở đây, gọi từ API
// tạo booking (POST /api/bookings, C6) TRƯỚC khi ghi vào DB. Không tin dữ liệu
// client cho bất kỳ giá trị nào ảnh hưởng tới tiền (ghi chú o) hay giấy tờ (ghi chú aa).

const Flight = require("../models/Flight");
const { ageInYears, toVN } = require("../lib/timezone");
const { priceAddons, AncillaryError } = require("../lib/ancillaries");
const {
  MIN_AGE_REQUIRE_ID_DOCUMENT,
  MIN_ROUND_TRIP_TRANSIT_MS,
  MAX_PASSENGERS_PER_BOOKING,
  MAX_PASSENGER_AGE_YEARS,
  PAYMENT_EXPIRY_BUFFER_MS,
} = require("../config/constants");

/** Lỗi nghiệp vụ có statusCode để API route trả về đúng mã lỗi HTTP. */
class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Ngày sinh phải là ngày có thật, KHÔNG ở tương lai và không quá
 * MAX_PASSENGER_AGE_YEARS tuổi. Trước đây ngày sinh tương lai làm tuổi ÂM và
 * lọt vào nhánh "dưới 14 tuổi" mà không bị chặn (client có `max` ở ô ngày,
 * nhưng gõ tay hoặc gọi API trực tiếp thì server phải tự chặn).
 *
 * So sánh theo NGÀY giờ VN (không so mốc giây) để em bé sinh trong ngày hôm
 * nay không bị coi nhầm là "tương lai" do lệch múi giờ UTC/VN.
 */
function validatePassengerDateOfBirth(passenger, now = new Date()) {
  const name = passenger.full_name ?? "";
  const raw = passenger.date_of_birth;
  if (!raw || Number.isNaN(new Date(raw).getTime())) {
    throw new ValidationError(`Hành khách "${name}" có ngày sinh không hợp lệ.`);
  }
  if (toVN(raw).format("YYYY-MM-DD") > toVN(now).format("YYYY-MM-DD")) {
    throw new ValidationError(`Ngày sinh của hành khách "${name}" không được ở trong tương lai.`);
  }
  if (ageInYears(raw, now) > MAX_PASSENGER_AGE_YEARS) {
    throw new ValidationError(
      `Ngày sinh của hành khách "${name}" không hợp lệ (quá ${MAX_PASSENGER_AGE_YEARS} tuổi).`
    );
  }
}

/**
 * Ghi chú (aa): validate document_type/document_id theo độ tuổi.
 * - >=14 tuổi: bắt buộc có document_id, document_type phải là cccd|passport.
 * - <14 tuổi: chấp nhận birth_certificate, không ép cấu trúc document_id.
 * KHÔNG ảnh hưởng amount — giá vé vẫn tính phẳng theo seat_class (mục 6, ngoài phạm vi).
 */
function validatePassengerDocument(passenger) {
  // Kiểu/độ dài: chặn object/mảng lọt vào (gây TypeError 500 ở .trim()) và chuỗi khổng lồ.
  if (typeof passenger?.full_name !== "string" || !passenger.full_name.trim() || passenger.full_name.length > 100) {
    throw new ValidationError("Họ tên hành khách phải là chuỗi từ 1 đến 100 ký tự.");
  }
  if (
    passenger.document_id !== undefined &&
    passenger.document_id !== null &&
    (typeof passenger.document_id !== "string" || passenger.document_id.length > 30)
  ) {
    throw new ValidationError(`Số giấy tờ của hành khách "${passenger.full_name}" không hợp lệ.`);
  }
  validatePassengerDateOfBirth(passenger);
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
 * MỚI THÊM: chặn 2 hành khách trong CÙNG 1 booking khai TRÙNG số giấy tờ —
 * về mặt logic không thể có 2 người thật cùng 1 số CCCD/hộ chiếu/giấy khai
 * sinh. Bỏ qua document_id RỖNG (trẻ dưới MIN_AGE_REQUIRE_ID_DOCUMENT tuổi
 * hợp lệ không cần điền — xem validatePassengerDocument) — KHÔNG được coi 2
 * document_id rỗng là "trùng nhau".
 */
function validateNoDuplicateDocumentIds(passengers) {
  const seenBy = new Map(); // document_id (đã trim) -> full_name người đầu tiên khai số đó
  for (const passenger of passengers) {
    const id = passenger.document_id?.trim();
    if (!id) continue;
    if (seenBy.has(id)) {
      throw new ValidationError(
        `Số giấy tờ "${id}" bị trùng giữa 2 hành khách ("${seenBy.get(id)}" và "${passenger.full_name}") — mỗi hành khách phải có số giấy tờ khác nhau.`
      );
    }
    seenBy.set(id, passenger.full_name);
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
 * Chuyến bay phải còn `scheduled` và CHƯA khởi hành mới đặt được. Tìm kiếm đã
 * lọc sẵn, nhưng POST /api/bookings nhận flight_id từ client nên phải tự chặn
 * (chuyến đã hủy hoặc đã bay không được tạo booking dù biết _id).
 */
function assertFlightBookable(flightDoc, now = new Date()) {
  if (flightDoc.status !== "scheduled") {
    throw new ValidationError(
      `Chuyến bay ${flightDoc.flight_number} không còn nhận đặt vé (đã bị hủy).`,
      409
    );
  }
  if (new Date(flightDoc.departure_time) <= now) {
    throw new ValidationError(
      `Chuyến bay ${flightDoc.flight_number} đã khởi hành, không thể đặt vé.`,
      409
    );
  }
}

/**
 * Mỗi hành khách phải có ĐÚNG 1 ghế trên MỖI chuyến của hành trình; không có
 * ghế thuộc chuyến ngoài hành trình; 2 hành khách không được chung 1 ghế. Giao
 * diện đã ép điều này, nhưng server phải tự kiểm — thiếu ghế thì
 * computeLegAmount tính 0 đồng cho người đó (vé miễn phí qua API trực tiếp).
 */
function validateSeatAssignments(passengers, legs) {
  const flightNumbers = new Map(legs.map((l) => [String(l.flightDoc._id), l.flightDoc.flight_number]));
  const seatOwner = new Map(); // `${flightId}:${seat}` -> tên hành khách đầu tiên

  for (const passenger of passengers) {
    const name = passenger.full_name ?? "";
    if (!Array.isArray(passenger.seats)) {
      throw new ValidationError(`Hành khách "${name}" chưa chọn ghế.`);
    }
    const seatedFlights = new Set();
    for (const seat of passenger.seats) {
      const fid = String(seat.flight_id);
      if (!flightNumbers.has(fid)) {
        throw new ValidationError(`Ghế ${seat.seat_number} thuộc chuyến bay không nằm trong hành trình đã chọn.`);
      }
      if (seatedFlights.has(fid)) {
        throw new ValidationError(
          `Hành khách "${name}" chọn nhiều hơn 1 ghế trên chuyến bay ${flightNumbers.get(fid)}.`
        );
      }
      seatedFlights.add(fid);
      const key = `${fid}:${seat.seat_number}`;
      if (seatOwner.has(key)) {
        throw new ValidationError(
          `Ghế ${seat.seat_number} (chuyến ${flightNumbers.get(fid)}) bị chọn trùng giữa "${seatOwner.get(key)}" và "${name}".`
        );
      }
      seatOwner.set(key, name);
    }
    for (const [fid, flightNumber] of flightNumbers) {
      if (!seatedFlights.has(fid)) {
        throw new ValidationError(`Hành khách "${name}" chưa chọn ghế cho chuyến bay ${flightNumber}.`);
      }
    }
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
 * ghế. Lỗi chỉ lộ ra SAU KHI VNPay đã trừ tiền thật, ở bước
 * seatService.confirmSeatBooked (điều kiện status: held, held_by: userId sẽ
 * fail vì ghế chưa từng được hold) → booking rơi oan vào
 * `payment_error_manual_refund` dù đáng ra phải bị chặn ngay từ lúc tạo
 * booking, không phải đợi tới lúc thanh toán xong mới phát hiện.
 */
function assertSeatIsHeldByUser(flightDoc, seatNumber, userId, now = new Date()) {
  const seat = flightDoc.seats.find((s) => s.seat_number === seatNumber);
  // payment_expires_at = held_until − 5 phút (ghi chú y): ghế phải còn giữ > 5 phút nữa thì
  // booking mới có thời gian thanh toán; held_until thiếu/sai cũng bị coi là không hợp lệ.
  const heldUntil = seat?.held_until ? new Date(seat.held_until).getTime() : NaN;
  const tooLate = !(heldUntil - PAYMENT_EXPIRY_BUFFER_MS > now.getTime());
  if (!seat || seat.status !== "held" || String(seat.held_by) !== String(userId) || tooLate) {
    throw new ValidationError(
      `Ghế ${seatNumber} chưa được bạn giữ hợp lệ (có thể đã hết hạn/sắp hết hạn giữ ghế hoặc bị người khác giữ). Vui lòng chọn lại ghế.`,
      409
    );
  }
}

/**
 * Vé khứ hồi: chặng về phải là chiều NGƯỢC của chặng đi (đi A→B thì về B→A). Trước đây server
 * chỉ kiểm tra transit nên gọi API trực tiếp có thể ghép 2 chặng không liên quan.
 */
function validateRoundTripRoute(outboundFlight, returnFlight) {
  if (
    outboundFlight.origin_code !== returnFlight.dest_code ||
    outboundFlight.dest_code !== returnFlight.origin_code
  ) {
    throw new ValidationError(
      "Chặng về phải là chiều ngược lại của chặng đi (đi A→B thì về B→A). Vui lòng chọn lại chặng về."
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
      // addons_amount do applyAddons() tính ở server (không phải giá client gửi).
      amount += basePrice[seatOnThisLeg.seat_class] + (seatOnThisLeg.addons_amount || 0);
    }
  }
  return amount;
}

/**
 * Tính lại dịch vụ bổ sung (hành lý ký gửi, suất ăn) cho từng ghế theo hạng ghế THẬT — ghi đè
 * baggage_kg/meal/addons_amount trong passengers[] (giá client gửi lên, nếu có, bị bỏ qua).
 * Gọi SAU assertSeatClassMatches để seat_class đã chắc chắn đúng. `pricing` = bảng giá hiện hành
 * (services/ancillaryPricingService.js); bỏ trống -> bảng giá mặc định.
 */
function applyAddons(passengers, pricing) {
  for (const passenger of passengers) {
    for (const seat of passenger.seats) {
      try {
        Object.assign(seat, priceAddons(seat, seat.seat_class, pricing));
      } catch (err) {
        if (err instanceof AncillaryError) throw new ValidationError(err.message, err.statusCode);
        throw err;
      }
    }
  }
}

/**
 * Hàm tổng hợp gọi khi tạo booking (C6). Ném ValidationError nếu có bất kỳ vi
 * phạm nào — API route bắt lỗi này và trả về đúng statusCode + message.
 *
 * @param {Object} params
 * @param {Array} params.passengers - dữ liệu hành khách client gửi lên
 * @param {Array} params.legs - [{ flightDoc, leg: 'outbound'|'return' }]
 * @param {String} params.userId - chủ booking, dùng đối chiếu held_by (MỚI THÊM)
 * @param {Object} [params.pricing] - bảng giá dịch vụ bổ sung (lib/ancillaries.js)
 */
async function validateBookingCreation({ passengers, legs, userId, pricing }) {
  // 0) Số lượng hợp lệ + chuyến còn đặt được (chưa hủy, chưa khởi hành)
  if (!Array.isArray(passengers) || passengers.length < 1) {
    throw new ValidationError("Booking phải có ít nhất 1 hành khách.");
  }
  if (passengers.length > MAX_PASSENGERS_PER_BOOKING) {
    throw new ValidationError(`Mỗi booking tối đa ${MAX_PASSENGERS_PER_BOOKING} hành khách.`);
  }
  for (const l of legs) {
    assertFlightBookable(l.flightDoc);
  }
  if (new Set(legs.map((l) => String(l.flightDoc._id))).size !== legs.length) {
    throw new ValidationError("Chặng đi và chặng về không được là cùng một chuyến bay.");
  }

  // 1) Validate giấy tờ theo độ tuổi cho từng hành khách
  for (const passenger of passengers) {
    validatePassengerDocument(passenger);
  }

  // 1b) Chặn trùng số giấy tờ GIỮA các hành khách trong cùng booking (MỚI THÊM)
  validateNoDuplicateDocumentIds(passengers);

  // 2) Validate transit time nếu khứ hồi
  if (legs.length === 2) {
    const outbound = legs.find((l) => l.leg === "outbound");
    const returnLeg = legs.find((l) => l.leg === "return");
    validateRoundTripRoute(outbound.flightDoc, returnLeg.flightDoc);
    validateRoundTripTransit(outbound.flightDoc, returnLeg.flightDoc);
  }

  // 2b) Mỗi hành khách có đúng 1 ghế trên mỗi chuyến, không trùng ghế
  validateSeatAssignments(passengers, legs);

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

  // 3b) Dịch vụ bổ sung — giá tính ở server theo hạng ghế thật
  applyAddons(passengers, pricing);

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
  validatePassengerDateOfBirth,
  validatePassengerDocument,
  validateNoDuplicateDocumentIds,
  assertFlightBookable,
  validateSeatAssignments,
  validateRoundTripTransit,
  assertSeatClassMatches,
  assertSeatIsHeldByUser,
  validateRoundTripRoute,
  computeLegAmount,
  applyAddons,
  validateBookingCreation,
};