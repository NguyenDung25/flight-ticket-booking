// scripts/seedAirlinesFromAirlabs.js
//
// Chạy 1 LẦN, thủ công, KHÔNG phải cron: node --env-file=.env.local scripts/seedAirlinesFromAirlabs.js
//
// Gọi AirLabs Airlines Database API (https://airlabs.co/docs/airlines) để
// lấy DANH SÁCH hãng bay Việt Nam thật (mã IATA/ICAO, tên tiếng Anh) — cùng
// pattern với scripts/seedAirlabs.js (sân bay): AirLabs chỉ dùng để XÁC NHẬN
// mã hãng bay còn tồn tại/hợp lệ, name.vi LUÔN lấy từ bảng tra tay
// CIVIL_AIRLINES bên dưới (AirLabs không có tên tiếng Việt — xem comment
// trong models/Airline.js).
//
// CẦN: biến môi trường AIRLABS_API_KEY trong .env.local — script này chạy
// bằng `node` trực tiếp, PHẢI kèm flag --env-file=.env.local (xem
// scripts/seedAirlabs.js, cùng lý do).

const mongoose = require("mongoose");
const Airline = require("../models/Airline");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flight-ticket-booking";
const AIRLABS_API_KEY = process.env.AIRLABS_API_KEY;
const AIRLABS_BASE_URL = "https://airlabs.co/api/v9";
const COUNTRY_CODE = "VN";

// CHỦ ĐỘNG CHỈ seed đúng 4 hãng bay CHỞ KHÁCH, ĐANG khai thác lịch bay
// thường lệ tại Việt Nam (đã tra chéo nhiều nguồn, tính tới thời điểm viết
// script — 09/2026) — country_code=VN AirLabs trả về nhiều mã khác không
// dùng được cho 1 web đặt vé demo:
//   - VASCO (0V): công ty con của Vietnam Airlines, chỉ bay tuyến ngắn/hải
//     đảo/thuê chuyến, không bán vé phổ thông qua kênh online thường.
//   - Pacific Airlines (BL): đã thành công ty con của Vietnam Airlines,
//     đang tái cơ cấu, không rõ còn bán vé độc lập hay không.
//   - Bamboo Airways (QH): ĐÃ NGỪNG bay thường lệ từ 22/08/2026 (chuyến bay
//     thường lệ cuối cùng), không còn bán được vé mới — seed vào sẽ cho ra
//     1 hãng bay không bao giờ có Flight nào, đúng lỗi UX đã tránh ở
//     CIVIL_AIRPORTS.
// Cả 3 trường hợp trên: nếu tình hình thay đổi (Bamboo bay lại, Pacific
// tách riêng...), chỉ cần thêm dòng vào bảng này rồi chạy lại script — KHÔNG
// cần sửa gì khác.
const CIVIL_AIRLINES = {
  VN: { nameVi: "Vietnam Airlines" },
  VJ: { nameVi: "Vietjet Air" },
  VU: { nameVi: "Vietravel Airlines" },
  "9G": { nameVi: "Sun PhuQuoc Airways" },
};

/**
 * AirLabs trả lỗi qua HTTP 200 kèm body {"error":{"message","code"}} — cùng
 * hành vi đã ghi chú trong scripts/seedAirlabs.js.
 */
async function fetchVietnamAirlines() {
  if (!AIRLABS_API_KEY) {
    throw new Error(
      "Thiếu AIRLABS_API_KEY trong môi trường — chạy lại với: node --env-file=.env.local scripts/seedAirlinesFromAirlabs.js"
    );
  }

  const url = `${AIRLABS_BASE_URL}/airlines?country_code=${COUNTRY_CODE}&api_key=${AIRLABS_API_KEY}`;
  const res = await fetch(url);
  const body = await res.json();

  if (body?.error) {
    throw new Error(`AirLabs trả lỗi [${body.error.code}]: ${body.error.message}`);
  }
  if (!res.ok) {
    throw new Error(`AirLabs trả HTTP ${res.status} nhưng không có field "error" rõ ràng.`);
  }

  const list = Array.isArray(body) ? body : body.response;
  if (!Array.isArray(list)) {
    throw new Error("Không đọc được danh sách hãng bay từ response AirLabs (định dạng lạ).");
  }
  return list;
}

async function main() {
  console.log("[seedAirlinesFromAirlabs] Đang gọi AirLabs API...");
  const rawAirlines = await fetchVietnamAirlines();
  console.log(`[seedAirlinesFromAirlabs] AirLabs trả về ${rawAirlines.length} hãng bay ở Việt Nam.`);

  // Khớp qua mã IATA — cùng cách seedAirlabs.js khớp sân bay.
  const matched = rawAirlines.filter((a) => a.iata_code && CIVIL_AIRLINES[a.iata_code]);
  const missingFromAirlabs = Object.keys(CIVIL_AIRLINES).filter(
    (code) => !rawAirlines.some((a) => a.iata_code === code)
  );

  console.log(
    `[seedAirlinesFromAirlabs] Khớp ${matched.length}/${Object.keys(CIVIL_AIRLINES).length} hãng bay trong danh sách.`
  );
  if (missingFromAirlabs.length > 0) {
    console.log(
      `[seedAirlinesFromAirlabs] CẢNH BÁO: ${missingFromAirlabs.length} hãng trong CIVIL_AIRLINES mà AirLabs KHÔNG trả về (kiểm tra lại mã, hoặc gói AirLabs không đủ dữ liệu): ${missingFromAirlabs.join(", ")}`
    );
  }

  await mongoose.connect(MONGO_URI);
  console.log("[seedAirlinesFromAirlabs] Đã kết nối MongoDB.");

  let upserted = 0;
  for (const code of Object.keys(CIVIL_AIRLINES)) {
    const info = CIVIL_AIRLINES[code];
    // name.en LẤY THẲNG từ AirLabs nếu khớp được (dữ liệu thật, chính xác
    // hơn tự gõ tay) — chỉ fallback về nameVi khi AirLabs không trả (hãng đó
    // nằm trong "missingFromAirlabs" ở trên), còn hơn để trống required field.
    const fromAirlabs = rawAirlines.find((a) => a.iata_code === code);
    const nameEn = fromAirlabs?.name || info.nameVi;

    const doc = {
      code,
      name: { vi: info.nameVi, en: nameEn },
    };
    const result = await Airline.updateOne({ code }, { $set: doc }, { upsert: true });
    if (result.upsertedCount > 0) upserted += 1;
  }

  console.log(
    `[seedAirlinesFromAirlabs] Xong — ${Object.keys(CIVIL_AIRLINES).length} hãng bay đã ghi vào DB, ${upserted} hãng MỚI vừa thêm.`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seedAirlinesFromAirlabs] Lỗi:", err.message);
  process.exit(1);
});
