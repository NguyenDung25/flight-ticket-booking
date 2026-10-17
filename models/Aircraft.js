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

/** Deep copy seat_map_template → mảng seats[] sẵn sàng gắn vào 1 Flight mới (A1, ghi chú u). */
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
