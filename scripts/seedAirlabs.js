// scripts/seedAirlabs.js
//
// Chạy 1 LẦN, thủ công, KHÔNG phải cron: node --env-file=.env.local scripts/seedAirlabs.js
//
// Bản THẬT thay cho scripts/seedAirports.js (nhập tay 10 sân bay) — gọi
// AirLabs Airport Database API (https://airlabs.co/docs/airports) để XÁC
// NHẬN mã IATA còn tồn tại/hợp lệ, nhưng name/city LUÔN lấy từ bảng tra tay
// CIVIL_AIRPORTS bên dưới (KHÔNG dùng field name/city thô của AirLabs nữa
// — xem lý do ở 2 ghi chú bên dưới).
//
// Sau khi chạy thành công và verify ổn, XÓA scripts/seedAirports.js.
//
// CẦN: biến môi trường AIRLABS_API_KEY trong .env.local. Script này chạy
// bằng `node` trực tiếp, KHÔNG qua Next.js nên KHÔNG tự nạp .env.local —
// PHẢI chạy kèm flag: node --env-file=.env.local scripts/seedAirlabs.js
//
// KHÔNG BAO GIỜ hardcode API key thẳng vào file này — key là bí mật riêng
// của tài khoản AirLabs, hardcode vào source code nghĩa là commit thẳng lên
// git (dù .env.local có bị gitignore, file .js này thì KHÔNG).

const mongoose = require("mongoose");
const Airport = require("../models/Airport");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flight-ticket-booking";
const AIRLABS_API_KEY = process.env.AIRLABS_API_KEY;
const AIRLABS_BASE_URL = "https://airlabs.co/api/v9";
const COUNTRY_CODE = "VN";
const COUNTRY_NAME_VI = "Việt Nam";

// Danh sách CHÍNH THỨC 22 sân bay DÂN DỤNG đang khai thác của Việt Nam (đã
// tra chéo 2 nguồn độc lập để xác nhận, không đoán). CHỦ ĐỘNG CHỈ seed đúng
// 22 mã này — AirLabs country_code=VN còn trả thêm ~20-30 mã khác (sân bay
// quân sự như Nha Trang cũ/NHA, sân bay nhỏ/đã đóng cửa...) mà đồ án KHÔNG
// cần: seed thêm các sân bay đó vào dropdown tìm vé là lỗi UX thật sự, vì
// mãi mãi sẽ không có Flight nào bay tới/đi từ đó — khách chọn được nhưng
// tìm kiếm luôn ra rỗng.
//
// Đây cũng là lý do name/city dùng THẲNG bảng này thay vì field thô của
// AirLabs — models/Airport.js đã ghi rõ AirLabs không có tên tiếng Việt, và
// city AirLabs trả cũng chỉ có bản tiếng Anh, trong khi trang này ưu tiên
// tiếng Việt (defaultLocale "vi").
const CIVIL_AIRPORTS = {
  HAN: { nameVi: "Nội Bài", nameEn: "Noi Bai", city: "Hà Nội" },
  HPH: { nameVi: "Cát Bi", nameEn: "Cat Bi", city: "Hải Phòng" },
  DIN: { nameVi: "Điện Biên Phủ", nameEn: "Dien Bien Phu", city: "Điện Biên" },
  THD: { nameVi: "Thọ Xuân", nameEn: "Tho Xuan", city: "Thanh Hóa" },
  VII: { nameVi: "Vinh", nameEn: "Vinh", city: "Nghệ An" },
  VDH: { nameVi: "Đồng Hới", nameEn: "Dong Hoi", city: "Quảng Bình" },
  HUI: { nameVi: "Phú Bài", nameEn: "Phu Bai", city: "Huế" },
  DAD: { nameVi: "Đà Nẵng", nameEn: "Da Nang", city: "Đà Nẵng" },
  VCL: { nameVi: "Chu Lai", nameEn: "Chu Lai", city: "Quảng Nam" },
  UIH: { nameVi: "Phù Cát", nameEn: "Phu Cat", city: "Bình Định" },
  TBB: { nameVi: "Tuy Hòa", nameEn: "Tuy Hoa", city: "Phú Yên" },
  CXR: { nameVi: "Cam Ranh", nameEn: "Cam Ranh", city: "Nha Trang" },
  BMV: { nameVi: "Buôn Ma Thuột", nameEn: "Buon Ma Thuot", city: "Đắk Lắk" },
  DLI: { nameVi: "Liên Khương", nameEn: "Lien Khuong", city: "Đà Lạt" },
  PXU: { nameVi: "Pleiku", nameEn: "Pleiku", city: "Gia Lai" },
  SGN: { nameVi: "Tân Sơn Nhất", nameEn: "Tan Son Nhat", city: "TP. Hồ Chí Minh" },
  CAH: { nameVi: "Cà Mau", nameEn: "Ca Mau", city: "Cà Mau" },
  VCS: { nameVi: "Côn Đảo", nameEn: "Con Dao", city: "Bà Rịa - Vũng Tàu" },
  VCA: { nameVi: "Cần Thơ", nameEn: "Can Tho", city: "Cần Thơ" },
  VKG: { nameVi: "Rạch Giá", nameEn: "Rach Gia", city: "Kiên Giang" },
  PQC: { nameVi: "Phú Quốc", nameEn: "Phu Quoc", city: "Phú Quốc" },
  VDO: { nameVi: "Vân Đồn", nameEn: "Van Don", city: "Quảng Ninh" },
};

/**
 * AirLabs trả lỗi qua HTTP 200 kèm body {"error":{"message","code"}} (xem
 * "Common Errors" trong docs — KHÔNG dùng HTTP status để phát hiện lỗi được).
 * Response thành công có thể là mảng thô [...] HOẶC bọc trong {request,
 * response:[...]} tùy version/tài liệu — xử lý cả 2 khả năng cho chắc.
 */
async function fetchVietnamAirports() {
  if (!AIRLABS_API_KEY) {
    throw new Error(
      "Thiếu AIRLABS_API_KEY trong môi trường — chạy lại với: node --env-file=.env.local scripts/seedAirlabs.js"
    );
  }

  const url = `${AIRLABS_BASE_URL}/airports?country_code=${COUNTRY_CODE}&api_key=${AIRLABS_API_KEY}`;
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
    throw new Error("Không đọc được danh sách sân bay từ response AirLabs (định dạng lạ).");
  }
  return list;
}

async function main() {
  console.log("[seedAirlabs] Đang gọi AirLabs API...");
  const rawAirports = await fetchVietnamAirports();
  console.log(`[seedAirlabs] AirLabs trả về ${rawAirports.length} sân bay/sân đỗ ở Việt Nam.`);

  // Chỉ giữ lại sân bay VỪA có mã IATA VỪA nằm trong CIVIL_AIRPORTS — 2 điều
  // kiện độc lập: mã IATA để chắc chắn AirLabs thật sự biết tới sân bay đó
  // (không tự bịa dữ liệu), CIVIL_AIRPORTS để lọc bỏ sân bay quân sự/nhỏ mà
  // đồ án không cần (xem comment ở bảng CIVIL_AIRPORTS).
  const matched = rawAirports.filter((a) => a.iata_code && CIVIL_AIRPORTS[a.iata_code]);
  const skippedCodes = rawAirports
    .map((a) => a.iata_code)
    .filter((code) => code && !CIVIL_AIRPORTS[code]);
  const missingFromAirlabs = Object.keys(CIVIL_AIRPORTS).filter(
    (code) => !rawAirports.some((a) => a.iata_code === code)
  );

  console.log(
    `[seedAirlabs] Khớp ${matched.length}/${Object.keys(CIVIL_AIRPORTS).length} sân bay dân dụng trong danh sách.`
  );
  if (skippedCodes.length > 0) {
    console.log(
      `[seedAirlabs] Bỏ qua ${skippedCodes.length} mã KHÔNG phải sân bay dân dụng (quân sự/nhỏ/đã đóng): ${skippedCodes.join(", ")}`
    );
  }
  if (missingFromAirlabs.length > 0) {
    console.log(
      `[seedAirlabs] CẢNH BÁO: ${missingFromAirlabs.length} sân bay trong CIVIL_AIRPORTS mà AirLabs KHÔNG trả về (kiểm tra lại mã, hoặc AirLabs thiếu dữ liệu): ${missingFromAirlabs.join(", ")}`
    );
  }

  await mongoose.connect(MONGO_URI);
  console.log("[seedAirlabs] Đã kết nối MongoDB.");

  let upserted = 0;
  for (const code of Object.keys(CIVIL_AIRPORTS)) {
    const info = CIVIL_AIRPORTS[code];
    const doc = {
      code,
      name: { vi: info.nameVi, en: info.nameEn },
      city: info.city,
      country: COUNTRY_NAME_VI,
    };
    const result = await Airport.updateOne({ code }, { $set: doc }, { upsert: true });
    if (result.upsertedCount > 0) upserted += 1;
  }

  console.log(
    `[seedAirlabs] Xong — ${Object.keys(CIVIL_AIRPORTS).length} sân bay dân dụng đã ghi vào DB, ${upserted} sân bay MỚI vừa thêm.`
  );
  console.log(
    "[seedAirlabs] LƯU Ý: seed đủ 22 sân bay trong CIVIL_AIRPORTS dù AirLabs có trả đủ hay không (dữ liệu name/city lấy từ bảng tay, AirLabs chỉ dùng để đối chiếu/cảnh báo phía trên)."
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[seedAirlabs] Lỗi:", err.message);
  process.exit(1);
});
