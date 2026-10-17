const mongoose = require("mongoose");
const Airline = require("../models/Airline");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flight-ticket-booking";
const AIRLABS_API_KEY = process.env.AIRLABS_API_KEY;
const AIRLABS_BASE_URL = "https://airlabs.co/api/v9";
const COUNTRY_CODE = "VN";

// Chủ động chỉ seed đúng 4 hãng bay chở khách, đang khai thác lịch bay thường lệ tại Việt Nam.
const CIVIL_AIRLINES = {
  VN: { nameVi: "Vietnam Airlines" },
  VJ: { nameVi: "Vietjet Air" },
  VU: { nameVi: "Vietravel Airlines" },
  "9G": { nameVi: "Sun PhuQuoc Airways" },
};

/** AirLabs trả lỗi qua HTTP 200 kèm body {"error":{"message","code"}}. */
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
    // name.en lấy thẳng từ AirLabs nếu khớp được (dữ liệu thật, chính xác hơn tự gõ tay).
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
