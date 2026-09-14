// models/Aircraft.js
//
// Bám sát mục 4 (Aircraft) của mongodb-schema-design.md.
// Ghi chú (u): seat_map_template là NGUỒN DUY NHẤT để sinh Flight.seats[] khi
// admin tạo chuyến bay (A1) — admin không nhập tay ghế cho từng chuyến.
//
// Lưu ý quan trọng: seat_map_template.length === total_seats KHÔNG được
// validate tự động (ngoài phạm vi đồ án, mục 6) — admin tự đảm bảo đúng khi
// nhập Aircraft. KHÔNG thêm validate cho việc này ở đây hay ở service khác.

const mongoose = require("mongoose");
const { Schema } = mongoose;

const SeatTemplateSchema = new Schema(
  {
    seat_number: { type: String, required: true }, // VD "1A", "12C"
    seat_class: { type: String, enum: ["economy", "business"], required: true },
  },
  { _id: false }
);

const AircraftSchema = new Schema(
  {
    name: { type: String, required: true }, // VD "Airbus A321"
    total_seats: { type: Number, required: true },
    seat_map_template: { type: [SeatTemplateSchema], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

/**
 * Deep copy seat_map_template → mảng seats[] sẵn sàng gắn vào 1 Flight mới
 * (A1, ghi chú u). Dùng structuredClone để đảm bảo mỗi Flight có bản ghế độc
 * lập hoàn toàn — sửa seats của Flight A không được ảnh hưởng Aircraft gốc
 * hay bất kỳ Flight B nào khác dùng chung Aircraft này.
 *
 * KHÔNG validate seat_map_template.length === total_seats ở đây (xem ghi chú
 * đầu file) — chỉ đơn thuần copy nguyên trạng.
 */
AircraftSchema.methods.cloneSeatMapForFlight = function () {
  const template = structuredClone(this.seat_map_template.map((s) => ({
    seat_number: s.seat_number,
    seat_class: s.seat_class,
  })));

  return template.map((seat) => ({
    seat_number: seat.seat_number,
    seat_class: seat.seat_class,
    status: "available",
    held_by: null,
    held_until: null,
    checked_in: false,
    checked_in_at: null,
    boarding_pass_code: null,
  }));
};

module.exports = mongoose.models.Aircraft || mongoose.model("Aircraft", AircraftSchema);
