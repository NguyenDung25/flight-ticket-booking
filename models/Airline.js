// models/Airline.js
//
// Bám sát mục 3 (Airline) của mongodb-schema-design.md.
// Seed ban đầu từ AirLabs (scripts/seedAirlabs.js), sau đó CÓ trang admin CRUD
// riêng (A2) — khác với Airport ở chỗ này.

const mongoose = require("mongoose");
const { Schema } = mongoose;

const AirlineSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true }, // IATA/ICAO code
    name: {
      vi: { type: String, required: true }, // AirLabs không trả tiếng Việt → bổ sung tay khi seed hoặc qua A2
      en: { type: String, required: true },
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

AirlineSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.models.Airline || mongoose.model("Airline", AirlineSchema);
