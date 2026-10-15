// tests/checkin.test.js — C10: check-in bằng mã đặt chỗ + họ tên (không cần đăng nhập), chặn chuyến đã
// hủy, trạng thái khung giờ, thẻ lên máy bay (nhãn theo Booking.locale, mã QR). Không cần MongoDB.
process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const Flight = require("../models/Flight");
const Booking = require("../models/Booking");
const User = require("../models/User");
const seatService = require("../services/seatService");
const { checkIn, lookupForCheckIn } = require("../services/checkinService");
const { checkInWindowState } = require("../lib/timezone");
const { boardingPassLabels, boardingTimeFor, boardingQrPayload, boardingQrSvg } = require("../lib/boardingPass");
const { normalizeBookingCode, normalizePassengerName, passengerNameMatches } = require("../lib/bookingCode");

const H = 3600 * 1000;
const patch = (obj, props) => {
  const saved = {};
  for (const k of Object.keys(props)) { saved[k] = obj[k]; obj[k] = props[k]; }
  return () => Object.assign(obj, saved);
};

const BOOKING = {
  _id: "b1", user_id: "u1", locale: "en", booking_code: "CX232K", status: "confirmed",
  passengers: [
    { full_name: "Lê Văn Mã Vé", seats: [{ flight_id: "f1", seat_number: "7B", seat_class: "business" }] },
    { full_name: "Trần Thị B", seats: [{ flight_id: "f1", seat_number: "7C", seat_class: "economy" }] },
  ],
};

/** Stub DB: booking tìm theo mã, chủ booking có/không bị khóa, ghi nhận lần check-in ghế. */
function stubDb({ booking = BOOKING, ownerBlocked = false } = {}) {
  const w = { filter: null, checkInArgs: null };
  const dep = new Date(Date.now() + 10 * H);
  const restores = [
    patch(Booking, { findOne: async (f) => { w.filter = f; return f.booking_code === booking?.booking_code ? booking : null; } }),
    patch(User, { findById: async () => ({ is_blocked: ownerBlocked }) }),
    patch(seatService, { checkInSeat: async (a) => { w.checkInArgs = a; return { boardingPassCode: "EXQBMJUB", checkedInAt: new Date() }; } }),
    patch(Flight, { findById: async () => ({ flight_number: "TS101039", origin_code: "HAN", dest_code: "SGN", departure_time: dep }) }),
  ];
  return { w, dep, restore: () => restores.forEach((r) => r()) };
}

test("normalizeBookingCode / normalizePassengerName: không phân biệt hoa thường, dấu, khoảng trắng", () => {
  assert.equal(normalizeBookingCode(" cx2 32k "), "CX232K");
  for (const bad of [null, 123, "CX232", "CX232K1", "CX-32K", { a: 1 }]) assert.equal(normalizeBookingCode(bad), null);
  assert.equal(normalizePassengerName("  lê   văn  mã vé "), "LE VAN MA VE");
  assert.equal(normalizePassengerName("Đặng Thị Đào"), "DANG THI DAO");
  for (const bad of [null, "", "   ", { $ne: "" }, ["A"], "x".repeat(101)]) assert.equal(normalizePassengerName(bad), null);
});

test("checkIn: đúng mã + họ tên (gõ không dấu, chữ thường) → thẻ lên máy bay, ghế ghi theo chủ booking", async () => {
  const s = stubDb();
  try {
    const pass = await checkIn({ flightId: "f1", seatNumber: "7B", bookingCode: "cx232k", passengerName: "le van ma ve", iciAccepted: true });
    assert.equal(s.w.filter.booking_code, "CX232K");
    assert.equal(s.w.filter.status, "confirmed");
    assert.equal(s.w.checkInArgs.userId, "u1"); // held_by của ghế booked = chủ tài khoản đặt vé
    assert.equal(pass.booking_code, "CX232K");
    assert.equal(pass.seat_class, "business");
    assert.equal(pass.passenger_name, "Lê Văn Mã Vé");
    assert.equal(pass.labels.boarding_pass, "Boarding Pass");
    assert.equal(pass.boarding_time.getTime(), s.dep.getTime() - 40 * 60 * 1000);
  } finally { s.restore(); }
});

test("checkIn: 1 hành khách làm thủ tục cho người khác cùng booking (giống website hãng)", async () => {
  const s = stubDb();
  try {
    const pass = await checkIn({ flightId: "f1", seatNumber: "7C", bookingCode: "CX232K", passengerName: "Lê Văn Mã Vé", iciAccepted: true });
    assert.equal(pass.passenger_name, "Trần Thị B");
  } finally { s.restore(); }
});

test("checkIn: thiếu / sai định dạng mã hoặc tên → 400, không chạm DB ghế", async () => {
  const s = stubDb();
  try {
    for (const [bookingCode, passengerName] of [[undefined, "A"], ["CX232K", ""], ["ABC", "A"], [{ $ne: "" }, "A"], ["CX232K", { $ne: "" }]]) {
      await assert.rejects(checkIn({ flightId: "f1", seatNumber: "7B", bookingCode, passengerName, iciAccepted: true }), { statusCode: 400 });
    }
    assert.equal(s.w.checkInArgs, null);
  } finally { s.restore(); }
});

test("checkIn: sai mã HOẶC đúng mã sai tên → cùng 1 lỗi 404 (không lộ mã nào tồn tại), không check-in", async () => {
  const s = stubDb();
  try {
    const wrongCode = await checkIn({ flightId: "f1", seatNumber: "7B", bookingCode: "ZZZZZZ", passengerName: "Le Van Ma Ve", iciAccepted: true }).catch((e) => e);
    const wrongName = await checkIn({ flightId: "f1", seatNumber: "7B", bookingCode: "CX232K", passengerName: "Nguyen Van X", iciAccepted: true }).catch((e) => e);
    assert.equal(wrongCode.statusCode, 404);
    assert.equal(wrongName.statusCode, 404);
    assert.equal(wrongCode.message, wrongName.message);
    assert.equal(s.w.checkInArgs, null);
  } finally { s.restore(); }
});

test("checkIn: ghế không thuộc booking → 404; tài khoản đặt vé bị khóa → 403", async () => {
  let s = stubDb();
  try {
    await assert.rejects(checkIn({ flightId: "f1", seatNumber: "9A", bookingCode: "CX232K", passengerName: "Tran Thi B", iciAccepted: true }), { statusCode: 404 });
  } finally { s.restore(); }
  s = stubDb({ ownerBlocked: true });
  try {
    await assert.rejects(checkIn({ flightId: "f1", seatNumber: "7B", bookingCode: "CX232K", passengerName: "Tran Thi B", iciAccepted: true }), { statusCode: 403 });
    assert.equal(s.w.checkInArgs, null);
  } finally { s.restore(); }
});

test("lookupForCheckIn: trả mọi ghế của booking, kèm trạng thái khung giờ và chuyến hủy", async () => {
  const dep = new Date(Date.now() + 10 * H);
  const flight = {
    _id: "f1", flight_number: "TS101039", origin_code: "HAN", dest_code: "SGN", departure_time: dep, status: "scheduled",
    seats: [
      { seat_number: "7B", checked_in: true, checked_in_at: new Date(), boarding_pass_code: "EXQBMJUB" },
      { seat_number: "7C", checked_in: false },
    ],
  };
  const booking = structuredClone(BOOKING);
  const s = stubDb({ booking });
  const restorePopulate = patch(Booking, {
    populate: async (doc) => { for (const p of doc.passengers) for (const seat of p.seats) seat.flight_id = flight; return doc; },
  });
  try {
    const items = await lookupForCheckIn({ bookingCode: "CX232K", passengerName: "TRAN THI B" });
    assert.equal(items.length, 2);
    const [a, b] = items;
    assert.deepEqual([a.seatNumber, a.checkedIn, a.boardingPassCode], ["7B", true, "EXQBMJUB"]);
    assert.deepEqual([b.seatNumber, b.checkedIn, b.windowState, b.flightCancelled], ["7C", false, "open", false]);
    assert.equal(a.bookingCode, "CX232K");
  } finally { restorePopulate(); s.restore(); }
});

test("checkInWindowState: chưa mở (>24h) / mở (24h–2h) / đã đóng (<2h, kể cả chưa cất cánh)", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  const dep = (h) => new Date(now.getTime() + h * H);
  assert.equal(checkInWindowState(dep(30), now), "not_yet_open");
  assert.equal(checkInWindowState(dep(24), now), "open");
  assert.equal(checkInWindowState(dep(2), now), "open");
  assert.equal(checkInWindowState(dep(1.5), now), "closed");
  assert.equal(checkInWindowState(dep(-3), now), "closed");
});

test("checkInSeat: chuyến đã bị hủy → từ chối 409, không ghi DB", async () => {
  let writes = 0;
  const restore = patch(Flight, {
    findById: async () => ({ _id: "f1", status: "cancelled", departure_time: new Date(Date.now() + 10 * H) }),
    findOneAndUpdate: async () => { writes += 1; return null; },
  });
  try {
    await assert.rejects(
      seatService.checkInSeat({ flightId: "f1", seatNumber: "6A", userId: "u1" }),
      { statusCode: 409, message: /đã bị hủy/ }
    );
    assert.equal(writes, 0);
  } finally { restore(); }
});

test("thẻ lên máy bay: nhãn theo locale, giờ lên máy bay −40 phút, QR chứa đúng mã/chuyến/ghế/tên không dấu", () => {
  assert.equal(boardingPassLabels("en").boarding_time, "Boarding time");
  assert.equal(boardingPassLabels("fr").boarding_pass, "Thẻ lên máy bay");
  assert.match(boardingPassLabels("vi").guide_with_bag, /Gửi hành lý nhanh/);
  assert.equal(boardingTimeFor(new Date("2026-10-15T13:39:00Z")).toISOString(), "2026-10-15T12:59:00.000Z");

  const item = {
    bookingCode: "CX232K", flightNumber: "TS101039", departureTime: "2026-10-15T13:39:00Z",
    originCode: "HAN", destCode: "SGN", seatNumber: "7B", passengerName: "Lê Văn Mã Vé", boardingPassCode: "EXQBMJUB",
  };
  assert.equal(boardingQrPayload(item), "DELAYX|CX232K|TS101039|20261015|HANSGN|7B|LE VAN MA VE|EXQBMJUB");
  const svg = boardingQrSvg(item);
  assert.match(svg, /^<svg /);
  assert.doesNotMatch(svg, /CX232K|<script/); // SVG chỉ gồm ô vuông, không nhúng văn bản
});

test("passengerNameMatches: nhận HỌ (từ đầu), tên cuối (kiểu phương Tây) hoặc nguyên họ tên", () => {
  assert.equal(passengerNameMatches("Nguyễn Văn An", "nguyen"), true);
  assert.equal(passengerNameMatches("Nguyễn Văn An", "NGUYỄN VĂN AN"), true);
  assert.equal(passengerNameMatches("John Smith", "smith"), true);
  assert.equal(passengerNameMatches("Nguyễn Văn An", "Văn"), false); // tên đệm không đủ
  assert.equal(passengerNameMatches("Nguyễn Văn An", "Nguyen Van"), false);
  assert.equal(passengerNameMatches("Nguyễn Văn An", ""), false);
});

test("checkIn: chỉ cần HỌ của 1 hành khách (như website hãng) → check-in được", async () => {
  const s = stubDb();
  try {
    const pass = await checkIn({ flightId: "f1", seatNumber: "7C", bookingCode: "CX232K", passengerName: "le", iciAccepted: true });
    assert.equal(pass.passenger_name, "Trần Thị B");
  } finally { s.restore(); }
});

test("checkIn: chưa đồng ý quy định ICI → 422, không chạm DB", async () => {
  const s = stubDb();
  try {
    for (const iciAccepted of [undefined, false, "true", 1]) {
      await assert.rejects(
        checkIn({ flightId: "f1", seatNumber: "7B", bookingCode: "CX232K", passengerName: "Le", iciAccepted }),
        { statusCode: 422, message: /ICI/ }
      );
    }
    assert.equal(s.w.filter, null);
    assert.equal(s.w.checkInArgs, null);
  } finally { s.restore(); }
});
