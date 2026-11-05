/**
 * Dữ liệu demo cho buổi bảo vệ (chạy sau `npm run seed`): thêm chuyến bay của hãng 9G (số hiệu thật, nhiều sân bay) cho 5 ngày tới
 * và nhật ký thao tác của các tài khoản admin theo bộ phận (FOC, KD, CS, IT). Chạy lại nhiều lần không tạo trùng.
 *   npm run seed:demo
 */
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) throw new Error("Không tìm thấy .env.local ở gốc project.");
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eqIdx + 1).trim();
  }
}
loadEnvLocal();
if (process.env.NODE_ENV === "production") {
  console.error("❌ Không chạy seed demo ở môi trường production.");
  process.exit(1);
}

const mongoose = require("mongoose");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);
const VN_TZ = "Asia/Ho_Chi_Minh";

const Airline = require("../models/Airline");
const Aircraft = require("../models/Aircraft");
const Airport = require("../models/Airport");
const Flight = require("../models/Flight");
const User = require("../models/User");
const AdminLog = require("../models/AdminLog");
const { OWN_AIRLINE_CODE } = require("../config/constants");

// Lịch bay nội địa THẬT của Sun PhuQuoc Airways (9G), lấy từ AirLabs (/schedules?airline_iata=9G) ngày 05/11/2026, đổi giờ UTC sang giờ Việt Nam.
// Chỉ lấy chuyến giữa các sân bay đã có trong hệ thống (bỏ chuyến quốc tế). Giá vé và loại tàu bay là dữ liệu demo.
// Mỗi dòng: số hiệu (sau mã 9G), đi, đến, giờ đi (VN), thời gian bay (phút), tàu bay, giá phổ thông, giá thương gia.
const SCHEDULE = [
  ["1144", "CXR", "HAN", "14:10", 110, "Airbus A320", 1290000, 3300000],
  ["1154", "CXR", "HAN", "18:00", 110, "Airbus A320", 1290000, 3300000],
  ["1158", "CXR", "HAN", "20:35", 110, "Airbus A320", 1290000, 3300000],
  ["2957", "CXR", "PQC", "13:50", 80, "Airbus A320", 1190000, 3100000],
  ["924", "DAD", "HAN", "13:35", 80, "Airbus A320", 990000, 2600000],
  ["928", "DAD", "HAN", "15:55", 80, "Airbus A320", 990000, 2600000],
  ["934", "DAD", "HAN", "17:55", 80, "Airbus A320", 990000, 2600000],
  ["946", "DAD", "HAN", "22:35", 80, "Airbus A320", 990000, 2600000],
  ["2965", "DAD", "PQC", "13:15", 105, "Airbus A320", 1390000, 3600000],
  ["983", "DAD", "SGN", "17:50", 90, "Airbus A320", 1090000, 2900000],
  ["985", "DAD", "SGN", "18:25", 90, "Airbus A320", 1090000, 2900000],
  ["993", "DAD", "SGN", "20:55", 90, "Airbus A320", 1090000, 2900000],
  ["997", "DAD", "SGN", "22:45", 90, "Airbus A320", 1090000, 2900000],
  ["1159", "HAN", "CXR", "18:00", 115, "Airbus A320", 1290000, 3300000],
  ["925", "HAN", "DAD", "13:55", 80, "Airbus A320", 990000, 2600000],
  ["929", "HAN", "DAD", "15:55", 80, "Airbus A320", 990000, 2600000],
  ["941", "HAN", "DAD", "20:35", 80, "Airbus A320", 990000, 2600000],
  ["1227", "HAN", "PQC", "13:00", 125, "Airbus A321neo", 1890000, 4800000],
  ["1233", "HAN", "PQC", "15:25", 125, "Airbus A321neo", 1890000, 4800000],
  ["1239", "HAN", "PQC", "17:00", 125, "Airbus A321neo", 1890000, 4800000],
  ["841", "HAN", "SGN", "12:50", 130, "Airbus A321neo", 1650000, 4200000],
  ["845", "HAN", "SGN", "14:30", 130, "Airbus A321neo", 1650000, 4200000],
  ["855", "HAN", "SGN", "15:40", 130, "Airbus A321neo", 1650000, 4200000],
  ["869", "HAN", "SGN", "18:35", 130, "Airbus A321neo", 1650000, 4200000],
  ["873", "HAN", "SGN", "19:15", 130, "Airbus A321neo", 1650000, 4200000],
  ["881", "HAN", "SGN", "21:00", 130, "Airbus A321neo", 1650000, 4200000],
  ["883", "HAN", "SGN", "21:30", 130, "Airbus A321neo", 1650000, 4200000],
  ["893", "HAN", "SGN", "23:40", 130, "Airbus A321neo", 1650000, 4200000],
  ["1511", "HPH", "SGN", "14:40", 130, "Airbus A320", 1490000, 3800000],
  ["1523", "HPH", "SGN", "20:45", 130, "Airbus A320", 1490000, 3800000],
  ["2956", "PQC", "CXR", "15:55", 80, "Airbus A320", 1190000, 3100000],
  ["2966", "PQC", "DAD", "16:00", 105, "Airbus A320", 1390000, 3600000],
  ["1218", "PQC", "HAN", "14:40", 125, "Airbus A321neo", 1890000, 4800000],
  ["1226", "PQC", "HAN", "16:00", 125, "Airbus A321neo", 1890000, 4800000],
  ["1232", "PQC", "HAN", "17:10", 125, "Airbus A321neo", 1890000, 4800000],
  ["1234", "PQC", "HAN", "18:10", 125, "Airbus A321neo", 1890000, 4800000],
  ["1244", "PQC", "HAN", "21:35", 125, "Airbus A321neo", 1890000, 4800000],
  ["1968", "PQC", "SGN", "13:55", 65, "Airbus A321neo", 1190000, 3100000],
  ["1972", "PQC", "SGN", "16:00", 65, "Airbus A321neo", 1190000, 3100000],
  ["1974", "PQC", "SGN", "17:00", 65, "Airbus A321neo", 1190000, 3100000],
  ["1976", "PQC", "SGN", "18:00", 65, "Airbus A321neo", 1190000, 3100000],
  ["1978", "PQC", "SGN", "18:50", 65, "Airbus A321neo", 1190000, 3100000],
  ["1984", "PQC", "SGN", "19:45", 65, "Airbus A321neo", 1190000, 3100000],
  ["978", "SGN", "DAD", "15:45", 85, "Airbus A320", 1090000, 2900000],
  ["986", "SGN", "DAD", "18:50", 85, "Airbus A320", 1090000, 2900000],
  ["990", "SGN", "DAD", "20:40", 85, "Airbus A320", 1090000, 2900000],
  ["854", "SGN", "HAN", "16:00", 130, "Airbus A321neo", 1650000, 4200000],
  ["860", "SGN", "HAN", "18:00", 130, "Airbus A321neo", 1650000, 4200000],
  ["868", "SGN", "HAN", "18:45", 130, "Airbus A321neo", 1650000, 4200000],
  ["880", "SGN", "HAN", "20:45", 130, "Airbus A321neo", 1650000, 4200000],
  ["882", "SGN", "HAN", "21:45", 130, "Airbus A321neo", 1650000, 4200000],
  ["884", "SGN", "HAN", "22:00", 130, "Airbus A321neo", 1650000, 4200000],
  ["890", "SGN", "HAN", "22:35", 130, "Airbus A321neo", 1650000, 4200000],
  ["1522", "SGN", "HPH", "18:00", 120, "Airbus A320", 1490000, 3800000],
  ["1975", "SGN", "PQC", "14:25", 65, "Airbus A321neo", 1190000, 3100000],
  ["1985", "SGN", "PQC", "17:50", 60, "Airbus A321neo", 1190000, 3100000],
  ["1987", "SGN", "PQC", "19:50", 60, "Airbus A321neo", 1190000, 3100000],
];
const DAYS = 5;

async function seedFlights() {
  const airline = await Airline.findOne({ code: OWN_AIRLINE_CODE });
  if (!airline) throw new Error(`Chưa có hãng ${OWN_AIRLINE_CODE} — chạy \`npm run seed\` trước.`);
  const codes = new Set((await Airport.find({}, "code").lean()).map((a) => a.code));
  const aircraftByName = Object.fromEntries((await Aircraft.find().lean().then((l) => l)).map((a) => [a.name, a._id]));
  let created = 0, skipped = 0, missing = 0;
  for (let d = 1; d <= DAYS; d++) {
    for (const [no, from, to, hhmm, mins, acName, eco, biz] of SCHEDULE) {
      if (!codes.has(from) || !codes.has(to) || !aircraftByName[acName]) { missing++; continue; }
      const [h, m] = hhmm.split(":").map(Number);
      const dep = dayjs().tz(VN_TZ).add(d, "day").hour(h).minute(m).second(0).millisecond(0).toDate();
      const flight_number = `${OWN_AIRLINE_CODE}${no}`;
      if (await Flight.exists({ flight_number, departure_time: dep })) { skipped++; continue; }
      const aircraft = await Aircraft.findById(aircraftByName[acName]);
      await Flight.create({
        flight_number, airline_id: airline._id, aircraft_id: aircraft._id,
        origin_code: from, dest_code: to, departure_time: dep, arrival_time: new Date(dep.getTime() + mins * 60_000),
        base_price: biz ? { economy: eco, business: biz } : { economy: eco },
        seats: aircraft.cloneSeatMapForFlight(),
      });
      created++;
    }
  }
  console.log(`✅ Chuyến bay: tạo ${created}, đã có ${skipped}, bỏ qua ${missing} (thiếu sân bay/tàu bay).`);
}

async function seedLogs() {
  if (await AdminLog.exists({ "details.demo": true })) {
    if (!process.argv.includes("--reset")) { console.log("↷ Nhật ký demo đã có — bỏ qua (thêm --reset để tạo lại)."); return; }
    await AdminLog.deleteMany({ "details.demo": true });
  }
  const users = Object.fromEntries((await User.find({ email: { $in: ["admin@example.com", "foc@example.com", "kd@example.com", "cs@example.com"] } }).lean()).map((u) => [u.email, u]));
  for (const e of ["admin@example.com", "foc@example.com", "kd@example.com", "cs@example.com"]) if (!users[e]) throw new Error(`Thiếu tài khoản ${e} — chạy \`npm run seed\` trước.`);
  const customer = await User.findOne({ email: "customer@example.com" }).lean();
  const ago = (days, hhmm) => { const [h, m] = hhmm.split(":").map(Number); return dayjs().tz(VN_TZ).subtract(days, "day").hour(h).minute(m).second(7).millisecond(0).toDate(); };
  const id = (x) => String(x);
  const rows = [
    // ADMIN IT
    ["admin@example.com", "user.role", "user", id(users["foc@example.com"]._id), "Đổi vai trò foc@example.com: Khách hàng → ADMIN FOC", ago(6, "08:40")],
    ["admin@example.com", "user.role", "user", id(users["kd@example.com"]._id), "Đổi vai trò kd@example.com: Khách hàng → ADMIN KD", ago(6, "08:42")],
    ["admin@example.com", "user.role", "user", id(users["cs@example.com"]._id), "Đổi vai trò cs@example.com: Khách hàng → ADMIN CS", ago(6, "08:44")],
    ["admin@example.com", "user.block", "user", id(customer._id), "Khóa tài khoản customer@example.com (nghi ngờ gian lận thanh toán)", ago(2, "15:20")],
    ["admin@example.com", "user.unblock", "user", id(customer._id), "Mở khóa tài khoản customer@example.com", ago(2, "16:05")],
    // ADMIN FOC
    ["foc@example.com", "aircraft.create", "aircraft", "demo-a321neo", "Thêm máy bay Airbus A321neo (182 ghế)", ago(5, "09:10")],
    ["foc@example.com", "flight.create", "flight", "demo-9g841", "Tạo chuyến 9G841 (HAN→SGN, 12:50)", ago(5, "09:35")],
    ["foc@example.com", "flight.create", "flight", "demo-9g1227", "Tạo chuyến 9G1227 (HAN→PQC, 13:00)", ago(5, "09:41")],
    ["foc@example.com", "flight.create", "flight", "demo-9g1975", "Tạo chuyến 9G1975 (SGN→PQC, 14:25)", ago(5, "09:48")],
    ["foc@example.com", "flight.update", "flight", "demo-9g841", "Sửa chuyến 9G841 (đổi giờ khởi hành 12:35 → 12:50)", ago(4, "14:12")],
    ["foc@example.com", "popular_route.update", "popular_route", "demo-han-sgn", "Sửa tuyến phổ biến HAN → SGN (đổi thứ tự hiển thị)", ago(4, "14:40")],
    ["foc@example.com", "flight.cancel_bulk", "flight", "demo-9g997", "Hủy chuyến 9G997 và xử lý 2 booking liên quan", ago(3, "10:30"), { reason: "Tàu bay bảo dưỡng đột xuất", affected_booking_count: 2 }],
    ["foc@example.com", "flight.delete", "flight", "demo-9g1231", "Xóa chuyến 9G1231 (tạo nhầm, chưa có booking)", ago(1, "11:05")],
    // ADMIN KD
    ["kd@example.com", "promotion.create", "promotion", "demo-summer26", "Tạo mã khuyến mãi SUMMER26 (giảm 10%)", ago(5, "10:15")],
    ["kd@example.com", "promotion.create", "promotion", "demo-welcome15", "Tạo mã khuyến mãi WELCOME15 (giảm 15%)", ago(5, "10:20")],
    ["kd@example.com", "promotion.update", "promotion", "demo-summer26", "Sửa mã khuyến mãi SUMMER26 (giảm 10% → 12%, gia hạn đến 31/12)", ago(3, "09:00")],
    ["kd@example.com", "flight.update", "flight", "demo-9g841", "Đổi giá vé chuyến 9G841 (phổ thông 1.550.000 → 1.650.000)", ago(3, "09:30"), { fields: "base_price" }],
    ["kd@example.com", "flight.update", "flight", "demo-9g1227", "Đổi giá vé chuyến 9G1227 (phổ thông 1.790.000 → 1.890.000)", ago(3, "09:34"), { fields: "base_price" }],
    ["kd@example.com", "ancillary.update", "setting", "ancillary_pricing", "Sửa giá hành lý và suất ăn (gói ký gửi 20kg: 250.000đ → 270.000đ)", ago(2, "11:20")],
    ["kd@example.com", "promotion.delete", "promotion", "demo-test10", "Xóa mã khuyến mãi TEST10 (hết hạn)", ago(1, "16:10")],
    // ADMIN CS
    ["cs@example.com", "booking.cancel", "booking", "demo-bk-1", "Hủy vé thay khách, booking Q7RM2K", ago(4, "10:05"), { reason: "Khách đổi lịch công tác", status: "refunded", refund_amount: 1_350_000 }],
    ["cs@example.com", "booking.manual_refund", "booking", "demo-bk-2", "Hoàn tiền tay booking H3XD9P: 1.650.000đ", ago(3, "15:45"), { amount: 1_650_000 }],
    ["cs@example.com", "booking.cancel", "booking", "demo-bk-3", "Hủy vé thay khách, booking W5TN8B", ago(2, "09:25"), { reason: "Khách đặt trùng chuyến", status: "refunded", refund_amount: 2_100_000 }],
    ["cs@example.com", "booking.manual_refund", "booking", "demo-bk-4", "Hoàn tiền tay booking L9CE4V: 890.000đ", ago(1, "14:30"), { amount: 890_000 }],
    ["cs@example.com", "booking.cancel", "booking", "demo-bk-5", "Hủy vé thay khách, booking P2UK6Z", ago(0, "08:50"), { reason: "Khách yêu cầu qua tổng đài", status: "refunded", refund_amount: 790_000 }],
  ];
  const docs = rows.map(([email, action, target_type, target_id, summary, created_at, extra]) => ({
    admin_id: users[email]._id, admin_email: email, action, target_type, target_id, summary,
    details: { ...(extra || {}), demo: true }, created_at,
  }));
  await AdminLog.collection.insertMany(docs);
  console.log(`✅ Nhật ký thao tác: thêm ${docs.length} dòng của ADMIN IT, FOC, KD, CS.`);
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("Thiếu MONGO_URI trong .env.local.");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Đã kết nối MongoDB");
  await seedFlights();
  await seedLogs();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Seed demo lỗi:", err);
  process.exit(1);
});
