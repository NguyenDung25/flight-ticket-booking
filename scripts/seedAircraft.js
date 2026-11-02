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
const { buildSeatMap, validateLayout } = require("../lib/seatLayout");

// Cấu hình ghế gần với đội bay đang khai thác tại Việt Nam (số liệu làm tròn theo hàng x ghế/hàng).
// Tên có mã dòng máy bay (A321neo, 787-9...) để khớp với matchAircraft() khi tra cứu từ AirLabs.
const FLEET = [
  { name: "Airbus A320", businessRows: 0, businessPerRow: 0, economyRows: 30, economyPerRow: 6 }, // 180 ghế, kiểu Vietjet
  { name: "Airbus A320neo", businessRows: 2, businessPerRow: 4, economyRows: 28, economyPerRow: 6 }, // 176 ghế
  { name: "Airbus A321neo", businessRows: 2, businessPerRow: 4, economyRows: 29, economyPerRow: 6 }, // 182 ghế, kiểu Vietnam Airlines
  { name: "Airbus A321neo (một hạng)", businessRows: 0, businessPerRow: 0, economyRows: 40, economyPerRow: 6 }, // 240 ghế, kiểu Vietjet
  { name: "Airbus A330-300", businessRows: 7, businessPerRow: 4, economyRows: 29, economyPerRow: 9 }, // 289 ghế
  { name: "Airbus A350-900", businessRows: 7, businessPerRow: 4, economyRows: 30, economyPerRow: 9 }, // 298 ghế
  { name: "Boeing 787-9", businessRows: 7, businessPerRow: 4, economyRows: 27, economyPerRow: 9 }, // 271 ghế
  { name: "ATR 72", businessRows: 0, businessPerRow: 0, economyRows: 18, economyPerRow: 4 }, // 72 ghế, tuyến ngắn
];

async function main() {
  if (!process.env.MONGO_URI) throw new Error("Thiếu MONGO_URI trong .env.local.");
  await mongoose.connect(process.env.MONGO_URI);

  for (const { name, ...layout } of FLEET) {
    const err = validateLayout(layout);
    if (err) throw new Error(`${name}: ${err}`);
    const seatMap = buildSeatMap(layout);
    // Upsert theo tên: chạy lại không tạo trùng; chuyến đã tạo giữ nguyên sơ đồ ghế cũ (đã sao chép vào chuyến).
    await Aircraft.findOneAndUpdate(
      { name },
      { name, total_seats: seatMap.length, seat_map_template: seatMap },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    const biz = layout.businessRows * layout.businessPerRow;
    console.log(`✅ ${name}: ${seatMap.length} ghế (${biz} business, ${seatMap.length - biz} economy)`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("LỖI:", err.message);
  process.exit(1);
});
