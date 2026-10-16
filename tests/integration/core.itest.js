// tests/integration/core.itest.js — test TÍCH HỢP chạy trên MongoDB THẬT (không stub DB): các thao tác
// cần tính atomic của MongoDB — giữ ghế, tranh ghế, cron nhả ghế, hủy vé đồng thời, IPN + trang kết quả
// chạy song song, check-in đồng thời, hạn mức mã khuyến mãi, token đặt lại mật khẩu dùng 1 lần, xác thực
// email, nhật ký admin.
//
// Chạy: npm run test:integration   (cần MongoDB đang chạy, mặc định mongodb://127.0.0.1:27017)
// - Mỗi lần chạy tạo 1 database RIÊNG tên "ftb-integration-<thời điểm>" rồi XÓA khi xong — không đụng
//   database của app. Đặt INTEGRATION_MONGO_URL để trỏ server khác (chỉ phần host, không kèm tên DB).
// - Không gửi email thật: xóa cấu hình SMTP và thay emailClient.sendTicketEmail bằng hàm đếm.

for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]) delete process.env[k];
const SERVER = (process.env.INTEGRATION_MONGO_URL || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
const DB_NAME = `ftb-integration-${Date.now()}`;
process.env.MONGO_URI = `${SERVER}/${DB_NAME}`;

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Airline = require("../../models/Airline");
const Aircraft = require("../../models/Aircraft");
const Flight = require("../../models/Flight");
const User = require("../../models/User");
const Booking = require("../../models/Booking");
const Promotion = require("../../models/Promotion");
const AdminLog = require("../../models/AdminLog");
const seat = require("../../services/seatService");
const cancellation = require("../../services/cancellationService");
const payment = require("../../services/paymentService");
const account = require("../../services/accountService");
const vnpayClient = require("../../lib/vnpayClient");
const emailClient = require("../../lib/emailClient");
const { logAdminAction } = require("../../lib/adminLog");
const { requireVerifiedEmail } = require("../../lib/requireVerifiedEmail");

const HOUR = 3600 * 1000;
const sent = { tickets: 0 };
let airline, aircraft, flightSeq = 0;

const seatOf = (f, n) => f.seats.find((s) => s.seat_number === n);
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

async function makeUser(email = `u${Date.now()}${Math.random()}@it.test`) {
  return User.create({ email, password_hash: await bcrypt.hash("Secret@123", 4), full_name: "Integration User" });
}

/** Chuyến bay mới (60 ghế phổ thông 1A..10F) khởi hành sau `hours` giờ. */
async function makeFlight(hours = 48) {
  const seats = [];
  for (let r = 1; r <= 10; r++) for (const c of "ABCDEF") {
    seats.push({ seat_number: `${r}${c}`, seat_class: "economy", status: "available", held_by: null, held_until: null, checked_in: false });
  }
  const dep = new Date(Date.now() + hours * HOUR);
  flightSeq += 1;
  return Flight.create({
    flight_number: `IT${100 + flightSeq}`, airline_id: airline._id, aircraft_id: aircraft._id,
    origin_code: "HAN", dest_code: "SGN", departure_time: dep, arrival_time: new Date(dep.getTime() + 2 * HOUR),
    base_price: { economy: 1_000_000 }, seats,
  });
}

/** Booking 1 khách, 1 ghế (ghế phải được user giữ/đặt trước theo kịch bản). */
function bookingDoc(user, flight, seatNumber, extra = {}) {
  return {
    user_id: user._id, trip_type: "one_way", locale: "vi", total_amount: 1_000_000,
    flights: [{ flight_id: flight._id, leg: "outbound", amount: 1_000_000 }],
    passengers: [{
      full_name: "Nguyen Van Test", document_type: "cccd", document_id: `0010990${Math.floor(Math.random() * 1e5)}`,
      date_of_birth: new Date("1990-01-01"), seats: [{ flight_id: flight._id, seat_number: seatNumber, seat_class: "economy" }],
    }],
    ...extra,
  };
}

before(async () => {
  assert.match(DB_NAME, /integration/, "chỉ chạy trên database test riêng");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Flight, User, Booking, Promotion, AdminLog].map((m) => m.syncIndexes()));
  airline = await Airline.create({ code: "IT", name: { vi: "Hãng Test", en: "Test Air" } });
  aircraft = await Aircraft.create({ name: "Test 60", total_seats: 60, seat_map_template: [] });
  emailClient.sendTicketEmail = async () => { sent.tickets += 1; };
});

after(async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === DB_NAME) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

test("giữ ghế: held + held_until ≈ 30 phút; người khác không giữ được; gọi lại không gia hạn", async () => {
  const [u1, u2] = [await makeUser(), await makeUser()];
  const f = await makeFlight();
  const r = await seat.holdSeat({ flightId: f._id, seatNumber: "1A", userId: u1._id });
  const s = seatOf(r, "1A");
  assert.equal(s.status, "held");
  assert.equal(String(s.held_by), String(u1._id));
  const minutes = (s.held_until - Date.now()) / 60000;
  assert.ok(minutes > 29 && minutes <= 30, `held_until ${minutes} phút`);

  assert.ok(await rejects(() => seat.holdSeat({ flightId: f._id, seatNumber: "1A", userId: u2._id })));
  const again = await seat.holdSeat({ flightId: f._id, seatNumber: "1A", userId: u1._id });
  assert.equal(seatOf(again, "1A").held_until.getTime(), s.held_until.getTime());
});

test("tranh ghế: 10 user giữ cùng 1 ghế đồng thời -> đúng 1 người thắng", async () => {
  const f = await makeFlight();
  const users = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
  const res = await Promise.allSettled(users.map((u) => seat.holdSeat({ flightId: f._id, seatNumber: "2B", userId: u._id })));
  assert.equal(res.filter((x) => x.status === "fulfilled").length, 1);
});

test("hạn mức giữ ghế: ghế thứ 21 của cùng 1 user bị 429", async () => {
  const u = await makeUser();
  const f = await makeFlight();
  const numbers = f.seats.map((s) => s.seat_number);
  for (let i = 0; i < 20; i++) await seat.holdSeat({ flightId: f._id, seatNumber: numbers[i], userId: u._id });
  const err = await rejects(() => seat.holdSeat({ flightId: f._id, seatNumber: numbers[20], userId: u._id }));
  assert.equal(err?.statusCode, 429);
});

test("ghế quá hạn: người khác chiếm được ngay; cron nhả ĐÚNG ghế quá hạn (arrayFilters)", async () => {
  const [u1, u2] = [await makeUser(), await makeUser()];
  const f = await makeFlight();
  for (const n of ["3A", "3B", "3C"]) await seat.holdSeat({ flightId: f._id, seatNumber: n, userId: u1._id });
  const past = new Date(Date.now() - 1000);
  await Flight.updateOne({ _id: f._id }, { $set: { "seats.$[e].held_until": past } }, { arrayFilters: [{ "e.seat_number": { $in: ["3A", "3B"] } }] });

  await seat.holdSeat({ flightId: f._id, seatNumber: "3A", userId: u2._id }); // không cần chờ cron
  await seat.releaseExpiredHolds();
  const after = await Flight.findById(f._id);
  assert.equal(String(seatOf(after, "3A").held_by), String(u2._id));
  assert.equal(seatOf(after, "3B").status, "available"); // quá hạn -> nhả
  assert.equal(seatOf(after, "3C").status, "held"); // còn hạn -> giữ nguyên
});

test("hủy vé: chưa thanh toán -> cancelled + nhả ghế; 5 request hủy đồng thời vé đã trả -> 1 thắng, 4 bị 409", async () => {
  const u = await makeUser();
  const f = await makeFlight(72);
  await seat.holdSeat({ flightId: f._id, seatNumber: "4A", userId: u._id });
  let bk = await Booking.create(bookingDoc(u, f, "4A", { status: "pending_payment" }));
  await cancellation.cancelBooking({ bookingId: bk._id, cancelReason: "test" });
  assert.equal((await Booking.findById(bk._id)).status, "cancelled");
  assert.equal(seatOf(await Flight.findById(f._id), "4A").status, "available");

  await seat.holdSeat({ flightId: f._id, seatNumber: "4B", userId: u._id });
  await seat.confirmSeatBooked({ flightId: f._id, seatNumber: "4B", userId: u._id });
  bk = await Booking.create(bookingDoc(u, f, "4B", { status: "confirmed", booking_code: `IT${Date.now().toString(36).slice(-4).toUpperCase()}` }));
  const out = await Promise.allSettled([1, 2, 3, 4, 5].map(() => cancellation.cancelBooking({ bookingId: bk._id, cancelReason: "race" })));
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(out.filter((x) => x.status === "rejected" && x.reason.statusCode === 409).length, 4);
  bk = await Booking.findById(bk._id);
  assert.equal(bk.status, "refunded");
  assert.equal(bk.cancellation_tier, "full"); // bay sau 72h -> hoàn 100%
  assert.equal(seatOf(await Flight.findById(f._id), "4B").status, "available");
});

test("thanh toán: IPN + trang kết quả (querydr) chạy song song -> confirmed 1 lần, 1 mã đặt chỗ, 1 email vé", async () => {
  const u = await makeUser();
  const f = await makeFlight();
  await seat.holdSeat({ flightId: f._id, seatNumber: "5A", userId: u._id });
  const bk = await Booking.create(bookingDoc(u, f, "5A", {
    status: "pending_payment",
    payment: { payment_expires_at: new Date(Date.now() + 20 * 60000), last_order_id: "", last_order_date: "20261016100000" },
  }));
  const txnRef = `${bk._id}${Date.now()}`;
  await Booking.updateOne({ _id: bk._id }, { $set: { "payment.last_order_id": txnRef } });

  const origVerify = vnpayClient.verifyReturnParams;
  const origQuery = vnpayClient.queryTransaction;
  vnpayClient.verifyReturnParams = () => true;
  vnpayClient.queryTransaction = async () => ({ status: "success", amount: 1_000_000, transId: "90000001", txnRef });
  const ipn = { vnp_TxnRef: txnRef, vnp_Amount: "100000000", vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_TransactionNo: "90000001", vnp_SecureHash: "x" };
  const before = sent.tickets;
  try {
    await Promise.all([
      payment.handleWebhook({ ...ipn }), payment.syncPaymentStatus(String(bk._id)),
      payment.handleWebhook({ ...ipn }), payment.syncPaymentStatus(String(bk._id)),
    ]);
  } finally {
    vnpayClient.verifyReturnParams = origVerify;
    vnpayClient.queryTransaction = origQuery;
  }
  const done = await Booking.findById(bk._id);
  assert.equal(done.status, "confirmed");
  assert.equal(done.payment.transaction_id, "90000001");
  assert.match(done.booking_code, /^[A-Z0-9]{6}$/);
  assert.equal(seatOf(await Flight.findById(f._id), "5A").status, "booked");
  assert.equal(sent.tickets - before, 1, "email vé chỉ gửi 1 lần");
});

test("check-in: 2 request check-in cùng ghế đồng thời -> 1 thành công, 1 bị từ chối", async () => {
  const u = await makeUser();
  const f = await makeFlight(10); // trong khung 24h–2h
  await seat.holdSeat({ flightId: f._id, seatNumber: "6A", userId: u._id });
  await seat.confirmSeatBooked({ flightId: f._id, seatNumber: "6A", userId: u._id });
  const out = await Promise.allSettled([1, 2].map(() => seat.checkInSeat({ flightId: f._id, seatNumber: "6A", userId: u._id })));
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  const s = seatOf(await Flight.findById(f._id), "6A");
  assert.equal(s.checked_in, true);
  assert.match(s.boarding_pass_code, /^[A-Z0-9]{8}$/);
});

test("mã khuyến mãi: usage_limit 3, 10 lượt dùng đồng thời -> đúng 3 thành công", async () => {
  await Promotion.create({
    code: "ITLIMIT3", discount_percent: 10, usage_limit: 3, used_count: 0,
    valid_from: new Date(Date.now() - HOUR), valid_until: new Date(Date.now() + HOUR),
  });
  const res = await Promise.all(Array.from({ length: 10 }, () => Promotion.incrementUsage("ITLIMIT3")));
  assert.equal(res.filter(Boolean).length, 3);
  assert.equal((await Promotion.findOne({ code: "ITLIMIT3" })).used_count, 3);
});

test("đặt lại mật khẩu: 2 lần dùng cùng token đồng thời -> đúng 1 thành công, mật khẩu đổi thật", async () => {
  const u = await makeUser();
  const req = await account.requestPasswordReset({ email: u.email });
  assert.ok(req?.token);
  const out = await Promise.allSettled([1, 2].map((i) => account.resetPassword({ token: req.token, newPassword: `NewPass@${i}` })));
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  const fresh = await User.findById(u._id);
  assert.ok(fresh.password_changed_at instanceof Date);
  const ok1 = await bcrypt.compare("NewPass@1", fresh.password_hash);
  const ok2 = await bcrypt.compare("NewPass@2", fresh.password_hash);
  assert.ok(ok1 !== ok2, "mật khẩu là đúng 1 trong 2 giá trị");
});

test("xác thực email: tài khoản mới bị chặn đặt vé; gửi lại quá sớm 429; link dùng 1 lần; tài khoản cũ không bị chặn", async () => {
  const old = await makeUser(); // tạo không có email_verified -> mặc định đã xác thực
  assert.equal(old.email_verified, true);
  assert.doesNotThrow(() => requireVerifiedEmail(old));

  const u = await User.create({ email: `new${Date.now()}@it.test`, password_hash: "x", full_name: "New", email_verified: false });
  assert.throws(() => requireVerifiedEmail(u), (e) => e.statusCode === 403);

  const first = await account.createEmailVerification({ userId: u._id, force: true });
  assert.equal((await rejects(() => account.createEmailVerification({ userId: u._id })))?.statusCode, 429);
  // Link mới (force) làm link cũ hết hiệu lực.
  const second = await account.createEmailVerification({ userId: u._id, force: true });
  assert.equal((await rejects(() => account.verifyEmail({ token: first.token })))?.statusCode, 400);

  const out = await Promise.allSettled([1, 2].map(() => account.verifyEmail({ token: second.token })));
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  const fresh = await User.findById(u._id);
  assert.equal(fresh.email_verified, true);
  assert.doesNotThrow(() => requireVerifiedEmail(fresh));
  assert.equal((await rejects(() => account.createEmailVerification({ userId: u._id, force: true })))?.statusCode, 409);
});

test("nhật ký admin: ghi vào collection AdminLog thật", async () => {
  const admin = await makeUser();
  await logAdminAction(admin, { action: "user.block", targetType: "user", targetId: "x1", summary: "Khóa tài khoản test", details: { password: "bí mật", note: "ok" } });
  const log = await AdminLog.findOne({ target_id: "x1" }).lean();
  assert.equal(log.admin_email, admin.email);
  assert.deepEqual(log.details, { note: "ok" });
});
