const fs = require("fs");
const path = require("path");

/** Nạp .env.local thủ công — script này chạy độc lập bằng `node`, không qua `next dev`/`next build`. */
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
// Tài khoản demo mật khẩu mặc định công khai — chỉ để chạy thử/bảo vệ đồ án.
if (process.env.NODE_ENV === "production") {
  console.error("❌ Không chạy seed demo ở môi trường production (có tài khoản admin mật khẩu mặc định).");
  process.exit(1);
}
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@123";
const CUSTOMER_EMAIL = "customer@example.com";
const CUSTOMER_PASSWORD = process.env.SEED_CUSTOMER_PASSWORD || "Customer@123";

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

/** Mốc giờ demo luôn tính từ "ngày mai" lúc chạy script — không hardcode 1 ngày cụ thể trong code. */
/** Lỗi thật tìm được khi soát lại (rất có thể chính là nguyên nhân "No matching flights found" khi test). */
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
      // Cùng hãng VN với VN200 (khác VJ300) — để test khứ hồi thành công: chọn VN200 (HAN->SGN) làm chặng đi.
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

    // Nguồn ghế duy nhất — giống hệt cách app/api/admin/flights/route.js sinh ghế, không tự bịa mảng seats[] ở đây.
    const seats = aircraft.cloneSeatMapForFlight();
    const flight = await Flight.create({ ...data, seats });
    console.log(
      `✅ Flight: ${flight.flight_number} (${flight.origin_code}→${flight.dest_code}, ` +
        // .toLocaleString("vi-VN") không chỉ định timeZone -> vẫn theo múi giờ hệ thống.
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