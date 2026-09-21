// scripts/cleanupAirports.js
//
// Chạy 1 LẦN: node --env-file=.env.local scripts/cleanupAirports.js
//
// Xóa mọi Airport KHÔNG nằm trong 22 mã dân dụng hợp lệ — dọn rác còn sót
// lại từ lần chạy đầu tiên của seedAirlabs.js (trước khi có bộ lọc), trong
// đó có vài bản ghi bị SPAM SEO chèn vào field "name" từ phía AirLabs (VD
// mã XHG/RKM/XAG chứa nội dung quảng cáo cờ bạc thay vì tên sân bay thật).

const mongoose = require("mongoose");
const Airport = require("../models/Airport");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flight-ticket-booking";

const VALID_CODES = [
  "HAN", "HPH", "DIN", "THD", "VII", "VDH", "HUI", "DAD", "VCL", "UIH",
  "TBB", "CXR", "BMV", "DLI", "PXU", "SGN", "CAH", "VCS", "VCA", "VKG",
  "PQC", "VDO",
];

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log("[cleanupAirports] Đã kết nối MongoDB.");

  const toDelete = await Airport.find({ code: { $nin: VALID_CODES } }, "code name").lean();
  if (toDelete.length === 0) {
    console.log("[cleanupAirports] Không có gì để xóa, DB đã sạch.");
  } else {
    console.log(`[cleanupAirports] Sẽ xóa ${toDelete.length} bản ghi:`);
    toDelete.forEach((a) => console.log(`  - ${a.code}: ${a.name?.vi || a.name?.en || "(?)"}`));
    const result = await Airport.deleteMany({ code: { $nin: VALID_CODES } });
    console.log(`[cleanupAirports] Đã xóa ${result.deletedCount} bản ghi.`);
  }

  const remaining = await Airport.countDocuments({});
  console.log(`[cleanupAirports] DB hiện còn ${remaining} sân bay (đúng phải là 22).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[cleanupAirports] Lỗi:", err.message);
  process.exit(1);
});
