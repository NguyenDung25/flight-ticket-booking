// tests/inputValidation.test.js
//
// Test cho các lỗi logic đầu vào đã sửa: ngày về trước ngày đi, ngày bay quá
// khứ, số khách âm/vượt giới hạn, ngày sinh tương lai, chuyến đã hủy/đã bay,
// hành khách thiếu ghế/trùng ghế. Không cần MongoDB: model Flight bị stub tại
// chỗ (cùng instance mà service đã require). Chạy bằng `npm test`.

const test = require("node:test");
const assert = require("node:assert/strict");

const Flight = require("../models/Flight");
const { searchFlights, FlightError } = require("../services/flightService");
const {
  validatePassengerDateOfBirth,
  assertFlightBookable,
  validateSeatAssignments,
  validateBookingCreation,
} = require("../services/bookingValidationService");
const { holdSeat, SeatConflictError } = require("../services/seatService");
const { toVN, todayStringVN } = require("../lib/timezone");

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const ymd = (offsetDays) => toVN(new Date(Date.now() + offsetDays * DAY)).format("YYYY-MM-DD");
const baseSearch = { origin: "SGN", destination: "HAN", tripType: "one_way" };

// Stub aggregate để các ca HỢP LỆ không chạm DB; ghi lại pipeline đã gửi.
function stubAggregate() {
  const calls = [];
  const original = Flight.aggregate;
  Flight.aggregate = async (pipeline) => {
    calls.push(pipeline);
    return [];
  };
  return { calls, restore: () => (Flight.aggregate = original) };
}

// ------------------------------------------------------------ C1: tìm kiếm
test("searchFlights: ngày đi quá khứ / sai định dạng / không có thật bị từ chối", async () => {
  for (const departureDate of [ymd(-1), "abc", "2026-02-31", "2026/10/10", "20261010"]) {
    await assert.rejects(
      () => searchFlights({ ...baseSearch, departureDate }),
      (e) => e instanceof FlightError && e.statusCode === 400,
      `phải từ chối departureDate=${departureDate}`
    );
  }
});

test("searchFlights: ngày về trước ngày đi bị từ chối, cùng ngày hoặc sau thì hợp lệ", async () => {
  const stub = stubAggregate();
  try {
    await assert.rejects(
      () => searchFlights({ ...baseSearch, tripType: "round_trip", departureDate: ymd(3), returnDate: ymd(2) }),
      { statusCode: 400, message: /Ngày về không được trước ngày đi/ }
    );
    await assert.rejects(
      () => searchFlights({ ...baseSearch, tripType: "round_trip", departureDate: ymd(3), returnDate: "2026-13-40" }),
      { statusCode: 400 }
    );
    const sameDay = await searchFlights({ ...baseSearch, tripType: "round_trip", departureDate: ymd(3), returnDate: ymd(3) });
    assert.deepEqual(sameDay, { outbound: [], return: [] });
    await searchFlights({ ...baseSearch, tripType: "round_trip", departureDate: ymd(3), returnDate: ymd(5) });
  } finally {
    stub.restore();
  }
});

test("searchFlights: số khách <1, không nguyên, hoặc >9 bị từ chối; 1..9 hợp lệ", async () => {
  const stub = stubAggregate();
  try {
    for (const passengerCount of [0, -1, 1.5, NaN, 10, 9999]) {
      await assert.rejects(
        () => searchFlights({ ...baseSearch, departureDate: ymd(1), passengerCount }),
        { statusCode: 400 },
        `phải từ chối passengerCount=${passengerCount}`
      );
    }
    for (const passengerCount of [1, 5, 9]) {
      await searchFlights({ ...baseSearch, departureDate: ymd(1), passengerCount });
    }
  } finally {
    stub.restore();
  }
});

test("searchFlights: ngày hôm nay chỉ lấy chuyến CHƯA khởi hành (mốc bắt đầu >= now)", async () => {
  const stub = stubAggregate();
  try {
    const before = Date.now();
    await searchFlights({ ...baseSearch, departureDate: todayStringVN() });
    const match = stub.calls[0][0].$match;
    assert.equal(match.status, "scheduled");
    assert.ok(match.departure_time.$gte.getTime() >= before, "$gte phải >= thời điểm hiện tại");

    stub.calls.length = 0;
    await searchFlights({ ...baseSearch, departureDate: ymd(2) });
    const futureMatch = stub.calls[0][0].$match;
    assert.ok(futureMatch.departure_time.$gte.getTime() > before + DAY, "ngày tương lai vẫn lấy từ 00:00 ngày đó");
  } finally {
    stub.restore();
  }
});

// ------------------------------------------------------------ C4: ngày sinh
test("validatePassengerDateOfBirth: tương lai / không hợp lệ / quá 120 tuổi bị từ chối", () => {
  const p = (date_of_birth) => ({ full_name: "A", date_of_birth });
  assert.throws(() => validatePassengerDateOfBirth(p(ymd(1))), { statusCode: 400, message: /tương lai/ });
  assert.throws(() => validatePassengerDateOfBirth(p("2999-01-01")), { statusCode: 400 });
  assert.throws(() => validatePassengerDateOfBirth(p("")), { statusCode: 400, message: /không hợp lệ/ });
  assert.throws(() => validatePassengerDateOfBirth(p("không phải ngày")), { statusCode: 400 });
  assert.throws(() => validatePassengerDateOfBirth(p("1800-01-01")), { statusCode: 400, message: /120/ });
});

test("validatePassengerDateOfBirth: sinh hôm nay và ngày hợp lệ được chấp nhận", () => {
  assert.doesNotThrow(() => validatePassengerDateOfBirth({ full_name: "Bé", date_of_birth: ymd(0) }));
  assert.doesNotThrow(() => validatePassengerDateOfBirth({ full_name: "A", date_of_birth: "1990-05-20" }));
});

// ------------------------------------------------------------ C6: tạo booking
function makeFlight(id, { status = "scheduled", departIn = 48 * HOUR, userId = "u1" } = {}) {
  const seat = (n, cls = "economy") => ({ seat_number: n, seat_class: cls, status: "held", held_by: userId });
  return {
    _id: id,
    flight_number: `VN${id}`,
    status,
    departure_time: new Date(Date.now() + departIn),
    arrival_time: new Date(Date.now() + departIn + 2 * HOUR),
    base_price: { economy: 1_000_000, business: 2_000_000 },
    seats: [seat("1A"), seat("1B"), seat("2A", "business")],
  };
}
const adult = (name, docId, seats) => ({
  full_name: name,
  date_of_birth: "1990-01-01",
  document_type: "cccd",
  document_id: docId,
  seats,
});
const seatOn = (flightId, n, cls = "economy") => ({ flight_id: flightId, seat_number: n, seat_class: cls });

test("assertFlightBookable: chuyến đã hủy hoặc đã khởi hành bị chặn 409", () => {
  assert.doesNotThrow(() => assertFlightBookable(makeFlight("1")));
  assert.throws(() => assertFlightBookable(makeFlight("1", { status: "cancelled" })), { statusCode: 409, message: /đã bị hủy/ });
  assert.throws(() => assertFlightBookable(makeFlight("1", { departIn: -HOUR })), { statusCode: 409, message: /đã khởi hành/ });
});

test("validateSeatAssignments: thiếu ghế, ghế ngoài hành trình, 2 ghế 1 chuyến, trùng ghế", () => {
  const legs = [{ flightDoc: makeFlight("1"), leg: "outbound" }];
  const ok = [adult("A", "000000000001", [seatOn("1", "1A")]), adult("B", "000000000002", [seatOn("1", "1B")])];
  assert.doesNotThrow(() => validateSeatAssignments(ok, legs));

  assert.throws(() => validateSeatAssignments([adult("A", "1", [])], legs), { statusCode: 400, message: /chưa chọn ghế/ });
  assert.throws(() => validateSeatAssignments([{ full_name: "A" }], legs), { statusCode: 400, message: /chưa chọn ghế/ });
  assert.throws(
    () => validateSeatAssignments([adult("A", "1", [seatOn("1", "1A"), seatOn("999", "1B")])], legs),
    { statusCode: 400, message: /không nằm trong hành trình/ }
  );
  assert.throws(
    () => validateSeatAssignments([adult("A", "1", [seatOn("1", "1A"), seatOn("1", "1B")])], legs),
    { statusCode: 400, message: /nhiều hơn 1 ghế/ }
  );
  assert.throws(
    () => validateSeatAssignments([adult("A", "1", [seatOn("1", "1A")]), adult("B", "2", [seatOn("1", "1A")])], legs),
    { statusCode: 400, message: /bị chọn trùng/ }
  );
});

test("validateSeatAssignments: khứ hồi thiếu ghế chặng về bị từ chối", () => {
  const legs = [
    { flightDoc: makeFlight("1"), leg: "outbound" },
    { flightDoc: makeFlight("2", { departIn: 96 * HOUR }), leg: "return" },
  ];
  assert.throws(() => validateSeatAssignments([adult("A", "1", [seatOn("1", "1A")])], legs), {
    statusCode: 400,
    message: /chưa chọn ghế cho chuyến bay VN2/,
  });
});

test("validateBookingCreation: 0 hoặc >9 hành khách, chuyến hủy/đã bay, 2 chặng cùng chuyến", async () => {
  const legs = [{ flightDoc: makeFlight("1"), leg: "outbound" }];
  const args = { legs, userId: "u1" };

  await assert.rejects(() => validateBookingCreation({ ...args, passengers: [] }), { statusCode: 400, message: /ít nhất 1/ });
  const ten = Array.from({ length: 10 }, (_, i) => adult(`K${i}`, `00000000000${i}`, []));
  await assert.rejects(() => validateBookingCreation({ ...args, passengers: ten }), { statusCode: 400, message: /tối đa 9/ });

  const one = [adult("A", "000000000001", [seatOn("1", "1A")])];
  await assert.rejects(
    () => validateBookingCreation({ passengers: one, userId: "u1", legs: [{ flightDoc: makeFlight("1", { status: "cancelled" }), leg: "outbound" }] }),
    { statusCode: 409 }
  );
  await assert.rejects(
    () => validateBookingCreation({ passengers: one, userId: "u1", legs: [{ flightDoc: makeFlight("1", { departIn: -HOUR }), leg: "outbound" }] }),
    { statusCode: 409 }
  );
  const same = makeFlight("1");
  await assert.rejects(
    () => validateBookingCreation({ passengers: one, userId: "u1", legs: [{ flightDoc: same, leg: "outbound" }, { flightDoc: same, leg: "return" }] }),
    { statusCode: 400, message: /cùng một chuyến bay/ }
  );
});

test("validateBookingCreation: ca hợp lệ tính đúng tiền; hành khách thiếu ghế KHÔNG còn được miễn phí", async () => {
  const legs = [{ flightDoc: makeFlight("1"), leg: "outbound" }];
  const good = [adult("A", "000000000001", [seatOn("1", "1A")]), adult("B", "000000000002", [seatOn("1", "2A", "business")])];
  const { amounts } = await validateBookingCreation({ passengers: good, legs, userId: "u1" });
  assert.equal(amounts["1"], 3_000_000); // 1.000.000 (economy) + 2.000.000 (business)

  const freeRider = [adult("A", "000000000001", [seatOn("1", "1A")]), adult("B", "000000000002", [])];
  await assert.rejects(() => validateBookingCreation({ passengers: freeRider, legs, userId: "u1" }), {
    statusCode: 400,
    message: /chưa chọn ghế/,
  });

  const futureBirth = [{ ...adult("A", "000000000001", [seatOn("1", "1A")]), date_of_birth: ymd(5) }];
  await assert.rejects(() => validateBookingCreation({ passengers: futureBirth, legs, userId: "u1" }), {
    statusCode: 400,
    message: /tương lai/,
  });
});

// ------------------------------------------------------------ C5: giữ ghế
test("holdSeat: chỉ giữ ghế chuyến scheduled và chưa khởi hành; báo đúng lý do khi thất bại", async () => {
  const origUpdate = Flight.findOneAndUpdate;
  const origFind = Flight.findById;
  try {
    let filterSeen;
    Flight.findOneAndUpdate = async (filter) => {
      filterSeen = filter;
      return null; // không match
    };

    const lean = (doc) => ({ select: () => ({ lean: async () => doc }) });

    Flight.findById = () => lean({ status: "cancelled", departure_time: new Date(Date.now() + DAY) });
    await assert.rejects(() => holdSeat({ flightId: "f1", seatNumber: "1A", userId: "u1" }), (e) => {
      assert.ok(e instanceof SeatConflictError);
      assert.match(e.message, /đã bị hủy hoặc đã khởi hành/);
      return true;
    });
    assert.equal(filterSeen.status, "scheduled");
    assert.ok(filterSeen.departure_time.$gt instanceof Date);

    Flight.findById = () => lean({ status: "scheduled", departure_time: new Date(Date.now() - HOUR) });
    await assert.rejects(() => holdSeat({ flightId: "f1", seatNumber: "1A", userId: "u1" }), /đã bị hủy hoặc đã khởi hành/);

    Flight.findById = () => lean({ status: "scheduled", departure_time: new Date(Date.now() + DAY) });
    await assert.rejects(() => holdSeat({ flightId: "f1", seatNumber: "1A", userId: "u1" }), /không còn trống/);
  } finally {
    Flight.findOneAndUpdate = origUpdate;
    Flight.findById = origFind;
  }
});
