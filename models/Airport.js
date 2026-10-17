const mongoose = require("mongoose");
const { Schema } = mongoose;

const AirportSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true }, // IATA code, VD "HAN", "SGN"
    name: {
      vi: { type: String, required: true }, // AirLabs không trả tiếng Việt → bổ sung tay khi seed
      en: { type: String, required: true },
    },
    city: { type: String, required: true },
    country: { type: String, required: true },
  },
  { timestamps: false } // Airport chỉ seed 1 lần, không cần created_at/updated_at
);

AirportSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.models.Airport || mongoose.model("Airport", AirportSchema);
