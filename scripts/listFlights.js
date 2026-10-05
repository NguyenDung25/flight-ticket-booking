// scripts/listFlights.js
//
// CHỈ để CHẨN ĐOÁN — chạy 1 lần, không phải seed. Liệt kê toàn bộ Flight
// đang có trong DB, kèm departure_time format theo giờ VN (đúng cách
// dayRangeVN() ở services/flightService.js sẽ đọc để tìm kiếm) — so sánh
// trực tiếp với ngày/tuyến bạn đang search trên UI để biết lệch ở đâu.
//
// Chạy: node --env-file=.env.local scripts/listFlights.js

const mongoose = require("mongoose");
const Flight = require("../models/Flight");
const { toVN, nowVN } = require("../lib/timezone");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/flight-ticket-booking";

async function main() {
  await mongoose.connect(MONGO_URI);

  console.log(`Giờ hiện tại (VN): ${nowVN().format("YYYY-MM-DD HH:mm")}`);
  console.log(`Hôm nay theo VN: ${nowVN().format("YYYY-MM-DD")}`);
  console.log("");

  const flights = await Flight.find({}).populate("airline_id", "code").sort({ departure_time: 1 }).lean();

  if (flights.length === 0) {
    console.log("KHÔNG có Flight nào trong DB — chưa seed, hoặc seed nhầm database khác.");
  } else {
    console.log(`Tổng ${flights.length} chuyến bay:\n`);
    for (const f of flights) {
      console.log(
        `${f.flight_number.padEnd(8)} ${f.origin_code}→${f.dest_code}  ` +
          `departure_time (VN): ${toVN(f.departure_time).format("YYYY-MM-DD HH:mm")}  ` +
          `status: ${f.status}  airline: ${f.airline_id?.code ?? "?"}`
      );
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});