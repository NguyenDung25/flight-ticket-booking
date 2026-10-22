const Flight = require("../models/Flight");
const { ageInYears, toVN } = require("../lib/timezone");
const { priceAddons, AncillaryError } = require("../lib/ancillaries");
const { normalizeDocumentId, isValidDocumentId } = require("../lib/bookingContact");
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

/** Ngày sinh phải là ngày có thật, không ở tương lai và không quá MAX_PASSENGER_AGE_YEARS tuổi. */
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

/** Ghi chú (aa): validate document_type/document_id theo độ tuổi. */
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
  // Lưu số giấy tờ ở dạng chuẩn (không khoảng trắng, viết hoa) rồi kiểm tra định dạng theo loại giấy tờ.
  passenger.document_id = normalizeDocumentId(passenger.document_id) || null;
  if (passenger.document_id && !isValidDocumentId(passenger.document_type, passenger.document_id)) {
    throw new ValidationError(
      `Số giấy tờ của hành khách "${passenger.full_name}" không đúng định dạng: CCCD gồm 12 chữ số, giấy khai sinh chỉ gồm chữ số, hộ chiếu gồm 6–9 chữ cái hoặc chữ số.`
    );
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
    // Dưới 14 tuổi: cho phép birth_certificate.
    if (passenger.document_type === "cccd") {
      throw new ValidationError(
        `Hành khách "${passenger.full_name}" dưới ${MIN_AGE_REQUIRE_ID_DOCUMENT} tuổi không thể dùng CCCD, chọn Giấy khai sinh hoặc Hộ chiếu.`
      );
    }
  }
}

/** Chặn 2 hành khách trong cùng 1 booking khai trùng số giấy tờ. */
function validateNoDuplicateDocumentIds(passengers) {
  const seenBy = new Map(); // document_id (đã chuẩn hóa) -> full_name người đầu tiên khai số đó
  for (const passenger of passengers) {
    const id = normalizeDocumentId(passenger.document_id);
    if (!id) continue;
    if (seenBy.has(id)) {
      throw new ValidationError(
        `Số giấy tờ "${id}" bị trùng giữa 2 hành khách ("${seenBy.get(id)}" và "${passenger.full_name}") — mỗi hành khách phải có số giấy tờ khác nhau.`
      );
    }
    seenBy.set(id, passenger.full_name);
  }
}

/** Ghi chú (z): validate khoảng cách transit tối thiểu 2 tiếng giữa chặng đi và chặng về cho vé khứ hồi. */
function validateRoundTripTransit(outboundFlight, returnFlight) {
  const gap = new Date(returnFlight.departure_time) - new Date(outboundFlight.arrival_time);
  if (gap < MIN_ROUND_TRIP_TRANSIT_MS) {
    throw new ValidationError(
      "Chặng về cất cánh quá sớm so với giờ hạ cánh chặng đi (cần tối thiểu 2 tiếng transit). Vui lòng chọn lại chặng về."
    );
  }
}

/** Chuyến bay phải còn `scheduled` và chưa khởi hành mới đặt được. */
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

/** Mỗi hành khách phải có đúng 1 ghế trên mỗi chuyến của hành trình; không có ghế thuộc chuyến ngoài hành trình. */
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

/** Ghi chú (o): đối chiếu seat_class client gửi lên với seat_class thật trong Flight.seats[seat_number]. */
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

/** Xác minh ghế đang thực sự `held` bởi đúng user đang tạo booking này — bắt buộc phải qua bước hold-seat. */
function assertSeatIsHeldByUser(flightDoc, seatNumber, userId, now = new Date()) {
  const seat = flightDoc.seats.find((s) => s.seat_number === seatNumber);
  // payment_expires_at = held_until − 5 phút (ghi chú y).
  const heldUntil = seat?.held_until ? new Date(seat.held_until).getTime() : NaN;
  const tooLate = !(heldUntil - PAYMENT_EXPIRY_BUFFER_MS > now.getTime());
  if (!seat || seat.status !== "held" || String(seat.held_by) !== String(userId) || tooLate) {
    throw new ValidationError(
      `Ghế ${seatNumber} chưa được bạn giữ hợp lệ (có thể đã hết hạn/sắp hết hạn giữ ghế hoặc bị người khác giữ). Vui lòng chọn lại ghế.`,
      409
    );
  }
}

/** Vé khứ hồi: chặng về phải là chiều ngược của chặng đi (đi A→B thì về B→A). */
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

/** Ghi chú (t): flights[i].amount = Σ (theo từng hành khách có seats[] chứa flight_id = flights[i].flight_id)… */
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

/** Tính lại dịch vụ bổ sung (hành lý ký gửi, suất ăn) cho từng ghế theo hạng ghế thật. */
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

/** Hàm tổng hợp gọi khi tạo booking (C6). */
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

  // 1b) Chặn trùng số giấy tờ giữa các hành khách trong cùng booking
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

  // 3) Đối chiếu seat_class thật + xác minh ghế đang được chính user này giữ cho từng ghế mỗi hành khách đã chọn.
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