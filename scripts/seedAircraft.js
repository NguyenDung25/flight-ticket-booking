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
const Aircraft = require("../models/Aircraft");
const { FLEET, buildFleetSeatMap } = require("../lib/fleet9G");

// Đội tàu bay của Sun PhuQuoc Airways (xem lib/fleet9G.js). Tên có mã dòng máy bay (A321, A321neo) để khớp matchAircraft() khi tra cứu từ AirLabs.
async function main() {
  if (!process.env.MONGO_URI) throw new Error("Thiếu MONGO_URI trong .env.local.");
  await mongoose.connect(process.env.MONGO_URI);

  for (const fleet of FLEET) {
    const seatMap = buildFleetSeatMap(fleet);
    // Upsert theo tên: chạy lại không tạo trùng; chuyến đã tạo giữ nguyên sơ đồ ghế cũ (đã sao chép vào chuyến).
    await Aircraft.findOneAndUpdate(
      { name: fleet.name },
      { name: fleet.name, total_seats: seatMap.length, seat_map_template: seatMap },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    const biz = fleet.businessRows * fleet.businessPerRow;
    console.log(`✅ ${fleet.name}: ${seatMap.length} ghế (${biz} business, ${seatMap.length - biz} economy)`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("LỖI:", err.message);
  process.exit(1);
});
