// scripts/seedTestFlights.js
//
// Tạo chuyến bay CHUYÊN ĐỂ TEST các mốc thời gian (hủy vé 3 mốc, check-in) —
// mốc giờ tính từ THỜI ĐIỂM CHẠY script, không cố định ngày:
//
//   TS30  HAN→SGN  khởi hành sau ~30 giờ  -> hủy vé: mốc  > 24h  (hoàn 100%)
//   TS31  SGN→HAN  khởi hành sau ~36 giờ  -> chặng về của TS30 (test khứ hồi, cùng hãng, cách >2h)
//   TS10  HAN→SGN  khởi hành sau ~10 giờ  -> hủy vé: mốc 3–24h (phạt phí cố định)
//                                            và ĐANG TRONG cửa sổ check-in (24h→2h trước giờ bay)
//   TS02  HAN→SGN  khởi hành sau ~2.5 giờ -> hủy vé: mốc  < 3h  (hoàn 0đ)
//                                            và vẫn còn trong cửa sổ check-in (đóng lúc còn 2h)
//
// LƯU Ý: chuyến TS02/TS10 sắp khởi hành thật — làm test sớm, để lâu sẽ trượt
// sang mốc khác. Muốn test lại thì chạy lại script (tạo bộ mới; mã chuyến bay
// gắn thêm giờ chạy để không trùng).
//
// Điều kiện: đã chạy `node scripts/seedSample.js` (cần hãng VN + tàu bay demo).
// Chạy: node scripts/seedTestFlights.js

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

const mongoose = require("mongoose");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);
const VN_TZ = "Asia/Ho_Chi_Minh";

const Airline = require("../models/Airline");
const Aircraft = require("../models/Aircraft");
const Flight = require("../models/Flight");

const HOUR_MS = 60 * 60 * 1000;
const fmt = (d) => dayjs(d).tz(VN_TZ).format("HH:mm DD/MM/YYYY");

async function main() {
  if (!process.env.MONGO_URI) throw new Error("Thiếu MONGO_URI trong .env.local.");
  await mongoose.connect(process.env.MONGO_URI);

  const airline = await Airline.findOne({ code: "VN" });
  const aircraft = await Aircraft.findOne({ name: "Airbus A321 (Demo)" });
  if (!airline || !aircraft) {
    throw new Error("Chưa có hãng VN / tàu bay demo — chạy `node scripts/seedSample.js` trước.");
  }

  const now = Date.now();
  const tag = dayjs().tz(VN_TZ).format("HHmm"); // tránh trùng mã khi chạy lại
  const plan = [
    { no: "TS30", from: "HAN", to: "SGN", depH: 30, durH: 2, note: "hủy mốc >24h" },
    { no: "TS31", from: "SGN", to: "HAN", depH: 36, durH: 2, note: "chặng về của TS30" },
    { no: "TS10", from: "HAN", to: "SGN", depH: 10, durH: 2, note: "hủy mốc 3–24h + check-in" },
    { no: "TS02", from: "HAN", to: "SGN", depH: 2.5, durH: 2, note: "hủy mốc <3h" },
  ];

  for (const p of plan) {
    const dep = new Date(now + p.depH * HOUR_MS);
    const arr = new Date(dep.getTime() + p.durH * HOUR_MS);
    const flight = await Flight.create({
      flight_number: `${p.no}${tag}`,
      airline_id: airline._id,
      aircraft_id: aircraft._id,
      origin_code: p.from,
      dest_code: p.to,
      departure_time: dep,
      arrival_time: arr,
      base_price: { economy: 1000000, business: 3000000 },
      seats: aircraft.cloneSeatMapForFlight(),
    });
    console.log(
      `✅ ${flight.flight_number}  ${p.from}→${p.to}  bay ${fmt(dep)}  (${p.note})`
    );
  }
  console.log("\nTìm chuyến: đúng NGÀY (giờ VN) ghi ở cột 'bay' bên trên — chuyến sau ~30h/36h có thể rơi vào ngày kia.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("LỖI:", err.message);
  process.exit(1);
});
