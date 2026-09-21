// scripts/seedAirports.js
//
// Chạy 1 LẦN, thủ công, KHÔNG phải cron: node scripts/seedAirports.js
//
// models/Airport.js có ghi chú "chỉ seed qua script từ AirLabs
// (scripts/seedAirlabs.js)" — file ĐÓ (gọi API AirLabs thật) chưa được viết.
// Đây là bản TẠM THỜI, nhập tay ~10 sân bay nội địa Việt Nam hay dùng nhất,
// đủ để test form tìm chuyến (C1) và seed dữ liệu Flight sau này — KHÔNG
// gọi AirLabs. Khi nào có script AirLabs thật, xóa file này đi.
//
// Dùng upsert (KHÔNG insertMany) — chạy lại nhiều lần không tạo trùng, an
// toàn nếu lỡ chạy 2 lần hoặc muốn thêm sân bay mới vào cùng danh sách.

const mongoose = require("mongoose");
const Airport = require("../models/Airport");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flight-ticket-booking";

const AIRPORTS = [
  { code: "HAN", name: { vi: "Nội Bài", en: "Noi Bai" }, city: "Hà Nội", country: "Việt Nam" },
  { code: "SGN", name: { vi: "Tân Sơn Nhất", en: "Tan Son Nhat" }, city: "TP. Hồ Chí Minh", country: "Việt Nam" },
  { code: "DAD", name: { vi: "Đà Nẵng", en: "Da Nang" }, city: "Đà Nẵng", country: "Việt Nam" },
  { code: "PQC", name: { vi: "Phú Quốc", en: "Phu Quoc" }, city: "Phú Quốc", country: "Việt Nam" },
  { code: "CXR", name: { vi: "Cam Ranh", en: "Cam Ranh" }, city: "Nha Trang", country: "Việt Nam" },
  { code: "HPH", name: { vi: "Cát Bi", en: "Cat Bi" }, city: "Hải Phòng", country: "Việt Nam" },
  { code: "VCA", name: { vi: "Cần Thơ", en: "Can Tho" }, city: "Cần Thơ", country: "Việt Nam" },
  { code: "HUI", name: { vi: "Phú Bài", en: "Phu Bai" }, city: "Huế", country: "Việt Nam" },
  { code: "VII", name: { vi: "Vinh", en: "Vinh" }, city: "Vinh", country: "Việt Nam" },
  { code: "DLI", name: { vi: "Liên Khương", en: "Lien Khuong" }, city: "Đà Lạt", country: "Việt Nam" },
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("[seedAirports] Đã kết nối MongoDB.");

  let upserted = 0;
  for (const airport of AIRPORTS) {
    const result = await Airport.updateOne(
      { code: airport.code },
      { $set: airport },
      { upsert: true }
    );
    if (result.upsertedCount > 0) upserted += 1;
  }

  console.log(
    `[seedAirports] Xong — ${AIRPORTS.length} sân bay trong danh sách, ${upserted} sân bay MỚI vừa thêm.`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seedAirports] Lỗi:", err);
  process.exit(1);
});
