// scripts/seedSample.js
//
// Seed dữ liệu MẪU để test nhanh toàn bộ luồng mà KHÔNG cần tạo tay qua
// Postman/Compass — 1 lệnh là có đủ:
//   - 1 tài khoản admin + 1 tài khoản customer (email/password in ra console)
//   - 2 Airline (VN, VJ), 1 Aircraft (Airbus A321 demo, 12 ghế business + 48
//     ghế economy), 2 Flight (HAN↔SGN, khởi hành "ngày mai" tính từ lúc chạy
//     — KHÔNG hardcode ngày cố định, tránh script hết hạn nếu chạy muộn hơn
//     lúc viết).
//
// AN TOÀN CHẠY LẠI NHIỀU LẦN (idempotent) — dùng upsert theo
// email/code/name, bỏ qua Flight nếu đã tồn tại đúng flight_number +
// departure_time, KHÔNG tạo trùng dữ liệu nếu chạy lại.
//
// Chạy: node scripts/seedSample.js

const fs = require("fs");
const path = require("path");

/**
 * Nạp .env.local thủ công — script này chạy độc lập bằng `node`, KHÔNG qua
 * `next dev`/`next build` (vốn tự động nạp .env.local), nên không có sẵn
 * biến môi trường nào nếu thiếu bước này. Viết tay thay vì thêm package
 * `dotenv` — chỉ cần parser rất đơn giản, không đáng thêm 1 dependency mới
 * cho đúng 1 file dùng 1 lần.
 */
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("Không tìm thấy .env.local ở gốc project.");
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);
const VN_TZ = "Asia/Ho_Chi_Minh";

const User = require("../models/User");
const Airline = require("../models/Airline");
const Aircraft = require("../models/Aircraft");
const Flight = require("../models/Flight");
const { BCRYPT_SALT_ROUNDS } = require("../config/constants");

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Admin@123";
const CUSTOMER_EMAIL = "customer@example.com";
const CUSTOMER_PASSWORD = "Customer@123";

async function seedUsers() {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);
  await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    { email: ADMIN_EMAIL, password_hash: adminHash, full_name: "Admin Demo", role: "admin" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  const customerHash = await bcrypt.hash(CUSTOMER_PASSWORD, BCRYPT_SALT_ROUNDS);
  await User.findOneAndUpdate(
    { email: CUSTOMER_EMAIL },
    { email: CUSTOMER_EMAIL, password_hash: customerHash, full_name: "Customer Demo", role: "customer" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  console.log(`✅ Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`✅ Customer: ${CUSTOMER_EMAIL} / ${CUSTOMER_PASSWORD}`);
}

async function seedAirlines() {
  const vietnamAirlines = await Airline.findOneAndUpdate(
    { code: "VN" },
    { code: "VN", name: { vi: "Vietnam Airlines", en: "Vietnam Airlines" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  const vietjet = await Airline.findOneAndUpdate(
    { code: "VJ" },
    { code: "VJ", name: { vi: "Vietjet Air", en: "Vietjet Air" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  console.log("✅ Airline: VN, VJ");
  return { vietnamAirlines, vietjet };
}

async function seedAircraft() {
  const seatMap = [];
  // Hàng 1-2: business (2 hàng x 4 cột = 8 ghế)
  for (const row of [1, 2]) {
    for (const col of ["A", "B", "C", "D"]) {
      seatMap.push({ seat_number: `${row}${col}`, seat_class: "business" });
    }
  }
  // Hàng 3-10: economy (8 hàng x 6 cột = 48 ghế)
  for (let row = 3; row <= 10; row++) {
    for (const col of ["A", "B", "C", "D", "E", "F"]) {
      seatMap.push({ seat_number: `${row}${col}`, seat_class: "economy" });
    }
  }

  const aircraft = await Aircraft.findOneAndUpdate(
    { name: "Airbus A321 (Demo)" },
    { name: "Airbus A321 (Demo)", total_seats: seatMap.length, seat_map_template: seatMap },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  console.log(`✅ Aircraft: ${aircraft.name} (${seatMap.length} ghế: 8 business, 48 economy)`);
  return aircraft;
}

/**
 * Mốc giờ demo luôn tính từ "ngày mai" lúc CHẠY script — KHÔNG hardcode 1
 * ngày cụ thể trong code, tránh chuyến bay demo bị lùi vào quá khứ (và do đó
 * biến mất khỏi kết quả C1, vì flightService chỉ trả `status: scheduled` và
 * bất kỳ ngày nào — kể cả quá khứ — về mặt kỹ thuật vẫn "scheduled" trừ khi
 * admin tự tay đổi, nhưng khách sẽ KHÔNG BAO GIỜ tìm thấy được chuyến trong
 * quá khứ vì luôn tìm theo ngày hiện tại/tương lai) nếu script chạy muộn hơn
 * nhiều so với lúc viết.
 */
/**
 * BUG THẬT tìm được khi soát lại (rất có thể chính là nguyên nhân
 * "No matching flights found" khi test): bản cũ dùng `new Date()` +
 * `setDate()`/`setHours()` — các hàm này lấy mốc "hôm nay"/"giờ X" theo
 * MÚI GIỜ HỆ THỐNG của máy chạy script (`Intl.DateTimeFormat().resolvedOptions().timeZone`),
 * KHÔNG PHẢI múi giờ Việt Nam. lib/timezone.js đã tự ghi chú rõ đúng cái bẫy
 * này (ghi chú ab: "tránh lệch giờ nếu server host chạy ở múi giờ khác
 * GMT+7") nhưng script seed lại không áp dụng.
 *
 * Hậu quả: nếu máy chạy `node scripts/seedSample.js` có múi giờ hệ thống
 * KHÁC Asia/Ho_Chi_Minh (rất dễ xảy ra — VD môi trường chạy ở UTC), "ngày
 * mai" tính theo múi giờ đó có thể LỆCH 1 ngày so với "ngày mai" mà
 * dayRangeVN() (dùng khi search) tính theo giờ VN — tùy đúng lúc chạy script
 * rơi vào khung giờ nào trong ngày. Kết quả: Flight bị seed vào đúng NGÀY
 * DƯƠNG LỊCH KHÁC với ngày /api/flights/search đang tìm → 0 kết quả, dù dữ
 * liệu vẫn nằm trong DB.
 *
 * Sửa bằng cách PIN CỨNG múi giờ Asia/Ho_Chi_Minh qua dayjs.tz(), giống hệt
 * cách lib/timezone.js đang làm — không phụ thuộc múi giờ hệ thống nữa.
 */
function tomorrowAt(hour) {
  return dayjs().tz(VN_TZ).add(1, "day").hour(hour).minute(0).second(0).millisecond(0).toDate();
}

async function seedFlights({ airlines, aircraft }) {
  const toSeed = [
    {
      flight_number: "VN200",
      airline_id: airlines.vietnamAirlines._id,
      aircraft_id: aircraft._id,
      origin_code: "HAN",
      dest_code: "SGN",
      departure_time: tomorrowAt(8),
      arrival_time: tomorrowAt(10),
      base_price: { economy: 1500000, business: 4000000 },
    },
    {
      flight_number: "VJ300",
      airline_id: airlines.vietjet._id,
      aircraft_id: aircraft._id,
      origin_code: "SGN",
      dest_code: "HAN",
      departure_time: tomorrowAt(14),
      arrival_time: tomorrowAt(16),
      base_price: { economy: 1200000, business: 3500000 },
    },
    {
      // Cùng hãng VN với VN200 (khác VJ300) — để test khứ hồi THÀNH CÔNG:
      // chọn VN200 (HAN->SGN) làm chặng đi, /search bước 2 phải lọc còn lại
      // ĐÚNG chuyến này (VJ300 bị loại vì khác hãng). Cách VN200 5 tiếng
      // (đến 10h, bay tiếp lúc 15h) — an toàn qua mốc tối thiểu 2h giữa 2
      // chặng khứ hồi.
      flight_number: "VN201",
      airline_id: airlines.vietnamAirlines._id,
      aircraft_id: aircraft._id,
      origin_code: "SGN",
      dest_code: "HAN",
      departure_time: tomorrowAt(15),
      arrival_time: tomorrowAt(17),
      base_price: { economy: 1500000, business: 4000000 },
    },
  ];

  for (const data of toSeed) {
    const existing = await Flight.findOne({
      flight_number: data.flight_number,
      departure_time: data.departure_time,
    });
    if (existing) {
      console.log(`↷ Bỏ qua (đã tồn tại): ${data.flight_number}`);
      continue;
    }

    // Nguồn ghế DUY NHẤT — giống hệt cách app/api/admin/flights/route.js
    // sinh ghế, KHÔNG tự bịa mảng seats[] ở đây.
    const seats = aircraft.cloneSeatMapForFlight();
    const flight = await Flight.create({ ...data, seats });
    console.log(
      `✅ Flight: ${flight.flight_number} (${flight.origin_code}→${flight.dest_code}, ` +
        // .toLocaleString("vi-VN") KHÔNG chỉ định timeZone -> vẫn theo múi giờ
        // hệ thống, cùng đúng bẫy vừa sửa ở tomorrowAt() — dùng dayjs.tz() để
        // dòng log này PHẢN ÁNH ĐÚNG giờ VN thật sự lưu trong DB, tránh tự
        // đánh lừa chính mình lúc debug.
        `khởi hành ${dayjs(flight.departure_time).tz(VN_TZ).format("HH:mm DD/MM/YYYY")}, ${flight.seats.length} ghế)`
    );
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("Thiếu MONGO_URI trong .env.local.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Đã kết nối MongoDB\n");

  await seedUsers();
  const airlines = await seedAirlines();
  const aircraft = await seedAircraft();
  await seedFlights({ airlines, aircraft });

  console.log("\n=== SEED HOÀN TẤT ===");
  console.log("Thử ngay: /search?origin=HAN&destination=SGN&departureDate=<ngày mai>&tripType=one_way");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("SEED LỖI:", err);
  process.exit(1);
});