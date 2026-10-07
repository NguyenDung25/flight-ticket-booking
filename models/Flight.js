// models/Flight.js
//
// Bám sát mục 5 (Flight) của mongodb-schema-design.md.
// Ghế nhúng trong seats[] (ghi chú c) — mọi thao tác giữ/nhả ghế là 1 update
// atomic trên đúng 1 document, không cần MongoDB Transaction.

const mongoose = require("mongoose");
const { Schema } = mongoose;

const SeatSchema = new Schema(
  {
    seat_number: { type: String, required: true }, // copy từ Aircraft.seat_map_template (ghi chú u)
    seat_class: { type: String, enum: ["economy", "business"], required: true },
    status: {
      type: String,
      enum: ["available", "held", "booked"],
      default: "available",
    },
    held_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    held_until: { type: Date, default: null },
    checked_in: { type: Boolean, default: false },
    checked_in_at: { type: Date, default: null },
    boarding_pass_code: { type: String, default: null },
  },
  { _id: false } // seat_number đủ để định danh trong mảng, không cần _id riêng
);

const FlightSchema = new Schema(
  {
    flight_number: { type: String, required: true },
    airline_id: { type: Schema.Types.ObjectId, ref: "Airline", required: true },
    aircraft_id: { type: Schema.Types.ObjectId, ref: "Aircraft", required: true }, // KHÔNG cho sửa sau khi tạo (A1)
    origin_code: { type: String, required: true }, // ref: Airport.code
    dest_code: { type: String, required: true }, // ref: Airport.code
    departure_time: { type: Date, required: true },
    arrival_time: { type: Date, required: true },

    base_price: {
      economy: { type: Number, required: true, min: [0, "Giá vé không được âm."] },
      business: { type: Number, min: [0, "Giá vé không được âm."] }, // bắt buộc nếu seats[] có ghế business — validate ở service (ghi chú s)
    },

    seats: { type: [SeatSchema], default: [] },

    status: { type: String, enum: ["scheduled", "cancelled"], default: "scheduled" },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Compound index phục vụ tìm kiếm C1
FlightSchema.index({ origin_code: 1, dest_code: 1, departure_time: 1 });

// --- Validate tầng schema mức cơ bản (mục 5, ghi chú s) ---
// Các validate PHỤ THUỘC dữ liệu khác (VD có booking hiệu lực hay không) phải
// nằm ở tầng service (services/flightService.js), KHÔNG đặt ở đây vì Mongoose
// pre-save hook không có sẵn quyền truy vấn collection Booking một cách sạch sẽ.
FlightSchema.pre("validate", function () {
  // Mongoose 9 đã bỏ tham số next khỏi pre-hook (callback-style middleware
  // không còn được hỗ trợ) — báo lỗi bằng throw, KHÔNG dùng next(err) như
  // các bản Mongoose cũ (xem mongoosejs.com/docs/migrating_to_9.html).
  if (this.origin_code === this.dest_code) {
    throw new Error("origin_code không được trùng dest_code.");
  }
  if (this.arrival_time <= this.departure_time) {
    throw new Error("arrival_time phải sau departure_time.");
  }
  const hasBusinessSeat = this.seats.some((s) => s.seat_class === "business");
  if (hasBusinessSeat && (this.base_price.business === undefined || this.base_price.business === null)) {
    throw new Error("Chuyến bay có ghế business thì base_price.business là bắt buộc.");
  }
});

module.exports = mongoose.models.Flight || mongoose.model("Flight", FlightSchema);
