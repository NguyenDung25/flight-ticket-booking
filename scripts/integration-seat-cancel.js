// Chạy: MONGO_URI=mongodb://localhost:27017/ftb-it node scripts/seedSample.js && MONGO_URI=... node scripts/integration-seat-cancel.js
// Cần MongoDB THẬT. Tuyệt đối đừng trỏ vào DB có dữ liệu thật (script ghi booking/ghế thử).
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ftb-it";
const mongoose = require("mongoose");
const Flight = require("../models/Flight");
const User = require("../models/User");
const Booking = require("../models/Booking");
const seat = require("../services/seatService");
const canc = require("../services/cancellationService");


// SHIM: FerretDB chưa có $size trong aggregation -> thay riêng pipeline đếm ghế bằng JS tương đương
// (MongoDB thật chạy được pipeline gốc). Mọi thao tác ghi/đọc khác đều chạy thật trên DB.
const origAgg = Flight.aggregate.bind(Flight);
if (process.env.USE_SHIM) Flight.aggregate = async (pipeline) => {
  const m = pipeline?.[0]?.$match?.seats?.$elemMatch;
  if (m && m.status === "held" && m.held_by) {
    const docs = await Flight.find({}).lean();
    let total = 0;
    for (const d of docs) for (const x of d.seats) if (x.status === "held" && String(x.held_by) === String(m.held_by) && x.held_until >= m.held_until.$gte) total++;
    return [{ _id: null, total }];
  }
  return origAgg(pipeline);
};

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); };
const oid = () => new mongoose.Types.ObjectId();
const seatOf = (f, n) => f.seats.find((s) => s.seat_number === n);
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const flights = await Flight.find({ status: "scheduled" }).sort({ flight_number: 1 });
  const A = flights.find((f) => f.flight_number === "VN200");
  const B = flights.find((f) => f.flight_number === "VN201") || flights[1];
  const users = [];
  for (let i = 0; i < 12; i++) users.push(oid());
  const [u1, u2] = users;
  const free = (f) => f.seats.filter((s) => s.status === "available").map((s) => s.seat_number);
  const seats = free(A);
  console.log("Chuyến", A.flight_number, "ghế trống:", seats.length);

  // TC-27 giữ ghế
  let r = await seat.holdSeat({ flightId: A._id, seatNumber: seats[0], userId: u1 });
  let s0 = seatOf(r, seats[0]);
  ok("TC-27 giữ ghế: status=held, held_by đúng", s0.status === "held" && String(s0.held_by) === String(u1));
  const mins = (s0.held_until - Date.now()) / 60000;
  ok("TC-27 held_until ≈ +30 phút", mins > 29 && mins <= 30, mins);
  let e = await rejects(() => seat.holdSeat({ flightId: A._id, seatNumber: seats[0], userId: u2 }));
  ok("TC-27 người khác không chọn được ghế đang giữ", !!e, "không lỗi");

  // TC-19 deep copy ghế giữa chuyến
  const Bf = await Flight.findById(B._id);
  ok("TC-19 cùng số ghế ở chuyến khác vẫn available", seatOf(Bf, seats[0]).status === "available");

  // TC-65 giữ lại không gia hạn
  const before = s0.held_until.getTime();
  await new Promise((r) => setTimeout(r, 1200));
  r = await seat.holdSeat({ flightId: A._id, seatNumber: seats[0], userId: u1 });
  ok("TC-65 gọi lại không gia hạn held_until", seatOf(r, seats[0]).held_until.getTime() === before);

  // Đua giữ cùng 1 ghế: 10 user -> đúng 1 thắng
  const target = seats[1];
  const res = await Promise.allSettled(users.slice(2).map((u) => seat.holdSeat({ flightId: A._id, seatNumber: target, userId: u })));
  const winners = res.filter((x) => x.status === "fulfilled").length;
  const fresh = await Flight.findById(A._id);
  ok("RACE 10 user giữ cùng ghế -> đúng 1 người thắng", winners === 1 && seatOf(fresh, target).status === "held", `winners=${winners}`);

  // TC-66 hạn mức 20 ghế
  const uq = users[11];
  let n = 0, err429 = null;
  for (const sn of seats.slice(2)) {
    const x = await rejects(() => seat.holdSeat({ flightId: A._id, seatNumber: sn, userId: uq }));
    if (x) { if (x.statusCode === 429) { err429 = x; } if (x.statusCode === 429) break; } else n++;
  }
  ok("TC-66 ghế thứ 21 bị 429 (giữ được đúng 20)", n === 20 && !!err429, `n=${n}`);

  // TC-67 ghế held quá hạn -> người khác chiếm được không cần cron
  const exp = seats[30];
  await seat.holdSeat({ flightId: A._id, seatNumber: exp, userId: u1 });
  await Flight.updateOne({ _id: A._id, "seats.seat_number": exp }, { $set: { "seats.$.held_until": new Date(Date.now() - 1000) } });
  r = await rejects(() => seat.holdSeat({ flightId: A._id, seatNumber: exp, userId: u2 }));
  const after = await Flight.findById(A._id);
  ok("TC-67 ghế quá hạn người khác chiếm được", !r && String(seatOf(after, exp).held_by) === String(u2), r && r.message);

  // Cron releaseExpiredHolds (arrayFilters)
  const exp2 = seats[31];
  await seat.holdSeat({ flightId: A._id, seatNumber: exp2, userId: u1 });
  await Flight.updateOne({ _id: A._id, "seats.seat_number": exp2 }, { $set: { "seats.$.held_until": new Date(Date.now() - 1000) } });
  const rr = await rejects(() => seat.releaseExpiredHolds());
  const after2 = await Flight.findById(A._id);
  ok("CRON releaseExpiredHolds nhả đúng ghế quá hạn, giữ ghế còn hạn", !rr && seatOf(after2, exp2).status === "available" && seatOf(after2, seats[0]).status === "held", rr && rr.message);

  // release-seat
  r = await seat.releaseSeat({ flightId: A._id, seatNumber: seats[0], userId: u2 });
  ok("release-seat: user khác nhả -> no-op", (await Flight.findById(A._id)).seats.find((s) => s.seat_number === seats[0]).status === "held");
  await seat.releaseSeat({ flightId: A._id, seatNumber: seats[0], userId: u1 });
  ok("release-seat: chủ nhả -> available", seatOf(await Flight.findById(A._id), seats[0]).status === "available");

  // Booking + hủy
  const mkBooking = (userId, status, sn, extra = {}) => ({
    user_id: userId, trip_type: "one_way", locale: "vi", total_amount: 1500000, status,
    passengers: [{ full_name: "NGUYEN VAN A", document_type: "cccd", document_id: "0123456789" + Math.floor(Math.random()*1e3), date_of_birth: new Date("1990-01-01"), seats: [{ flight_id: A._id, seat_number: sn, seat_class: "economy" }] }],
    flights: [{ flight_id: A._id, leg: "outbound", amount: 1500000 }],
    ...extra,
  });
  // TC-40 hủy pending
  const sp = seats[40];
  await seat.holdSeat({ flightId: A._id, seatNumber: sp, userId: u1 });
  let bk = await Booking.create(mkBooking(u1, "pending_payment", sp));
  let c = await rejects(() => canc.cancelBooking({ bookingId: bk._id, cancelReason: "test" }));
  bk = await Booking.findById(bk._id);
  ok("TC-40 hủy pending_payment: cancelled + nhả ghế", !c && bk.status === "cancelled" && seatOf(await Flight.findById(A._id), sp).status === "available", c && c.message);

  // TC-83 hủy đồng thời booking confirmed
  const sc = seats[41];
  await seat.holdSeat({ flightId: A._id, seatNumber: sc, userId: u1 });
  await seat.confirmSeatBooked({ flightId: A._id, seatNumber: sc, userId: u1 });
  bk = await Booking.create(mkBooking(u1, "confirmed", sc, { booking_code: "TST" + Date.now().toString().slice(-6) }));
  const out = await Promise.allSettled([1, 2, 3, 4, 5].map(() => canc.cancelBooking({ bookingId: bk._id, cancelReason: "race" })));
  const won = out.filter((x) => x.status === "fulfilled").length;
  const lost409 = out.filter((x) => x.status === "rejected" && x.reason.statusCode === 409).length;
  bk = await Booking.findById(bk._id);
  ok("TC-83 5 request hủy đồng thời -> 1 thắng, 4 bị 409", won === 1 && lost409 === 4 && bk.status === "refunded", `won=${won} 409=${lost409} status=${bk.status}`);
  ok("TC-41 hủy >=24h (bay ngày mai 08:00 - kết quả tùy giờ hiện tại): tier/fee hợp lệ", ["full","fixed_fee","none"].includes(bk.cancellation_tier), bk.cancellation_tier);
  console.log("   tier:", bk.cancellation_tier, "fee:", bk.cancellation_fee_amount, "refund:", bk.refund_amount);
  ok("TC-83 ghế được nhả sau hoàn", seatOf(await Flight.findById(A._id), sc).status === "available");

  console.log(`\nKẾT QUẢ: ${pass} pass, ${fail} fail`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("LỖI SCRIPT", e); process.exit(2); });
