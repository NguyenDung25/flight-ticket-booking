// models/Booking.js
//
// Bám sát mục 6 (Booking) của mongodb-schema-design.md, đã cập nhật
// document_type (ghi chú aa) trong passengers[].
// Đây là collection phức tạp nhất — nhúng passengers[], flights[] (tóm tắt
// từng chặng), payment. Không dùng MongoDB Transaction (mục 10).

const mongoose = require("mongoose");
const { Schema } = mongoose;

const PassengerSeatSchema = new Schema(
  {
    flight_id: { type: Schema.Types.ObjectId, ref: "Flight", required: true }, // 1 phần tử / chặng
    seat_number: { type: String, required: true },
    seat_class: { type: String, enum: ["economy", "business"], required: true }, // gắn theo TỪNG khách (ghi chú m)
  },
  { _id: false }
);

const PassengerSchema = new Schema(
  {
    full_name: { type: String, required: true },
    // Ghi chú aa: document_id vẫn là 1 trường String chung, document_type chỉ
    // dùng để biết cách diễn giải/validate document_id, KHÔNG tách nhiều field.
    document_type: {
      type: String,
      enum: ["cccd", "passport", "birth_certificate"],
      required: true,
    },
    document_id: { type: String, default: null }, // bắt buộc hay không tùy tuổi — validate ở service
    date_of_birth: { type: Date, required: true },
    seats: { type: [PassengerSeatSchema], default: [] },
  },
  { _id: false }
);

const FlightLegSchema = new Schema(
  {
    flight_id: { type: Schema.Types.ObjectId, ref: "Flight", required: true },
    leg: { type: String, enum: ["outbound", "return"], required: true },
    amount: { type: Number, required: true }, // Σ giá theo seat_class từng khách trên chặng này (ghi chú t)
  },
  { _id: false }
);

const PaymentSchema = new Schema(
  {
    method: { type: String, default: "momo" },
    transaction_id: { type: String, default: null }, // unique + sparse (ghi chú i)
    paid_at: { type: Date, default: null },
    payment_expires_at: { type: Date, default: null }, // = held_until − 5 phút (ghi chú y)
  },
  { _id: false }
);

const BookingSchema = new Schema(
  {
    booking_code: { type: String, default: null }, // sinh sau khi thanh toán thành công (C7)
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true }, // bắt buộc (ghi chú a)
    trip_type: { type: String, enum: ["one_way", "round_trip"], required: true },
    locale: { type: String, enum: ["vi", "en"], required: true }, // chụp User.preferred_language lúc đặt

    flights: { type: [FlightLegSchema], default: [] },
    passengers: { type: [PassengerSchema], default: [] },

    promotion_id: { type: Schema.Types.ObjectId, ref: "Promotion", default: null },
    total_amount: { type: Number, required: true },

    status: {
      type: String,
      enum: [
        "pending_payment",
        "confirmed",
        "cancelled",
        "refunded",
        "payment_error_manual_refund",
      ],
      default: "pending_payment",
    },

    payment: { type: PaymentSchema, default: () => ({}) },

    // --- Field phục vụ hủy vé tự động (ghi chú x) ---
    cancel_reason: { type: String, default: null },
    refund_amount: { type: Number, default: null },
    cancellation_fee_amount: { type: Number, default: null },
    cancellation_tier: {
      type: String,
      enum: ["full", "fixed_fee", "none", "partial"],
      default: null,
    },
    refund_processed_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Index theo bảng tổng hợp mục 8
BookingSchema.index(
  { "payment.transaction_id": 1 },
  { unique: true, sparse: true }
);
BookingSchema.index({ booking_code: 1 }, { unique: true, sparse: true });
BookingSchema.index({ user_id: 1, created_at: -1 });
BookingSchema.index({ "flights.flight_id": 1, status: 1 }); // giữ compound, xem lý do trong file thiết kế

// --- Validate tầng schema mức cơ bản ---
// passengers[].seats phải khớp ĐÚNG tập hợp flight_id của flights[] — không chỉ
// khớp số lượng. VD khứ hồi (2 chặng): nếu 1 hành khách có 2 ghế cùng thuộc
// chặng đi, thiếu hẳn chặng về, kiểu check "seats.length === flights.length"
// vẫn pass (2 = 2) dù thiếu chặng — phải so khớp từng flight_id.
// Validate SÂU HƠN (đối chiếu seat_class thật, tuổi/giấy tờ, transit time...) đặt
// ở services/bookingValidationService.js vì cần dữ liệu từ collection Flight khác.
BookingSchema.pre("validate", function (next) {
  const expectedFlightIds = this.flights.map((f) => String(f.flight_id)).sort();
  for (const p of this.passengers) {
    const actualFlightIds = p.seats.map((s) => String(s.flight_id)).sort();
    const matches =
      actualFlightIds.length === expectedFlightIds.length &&
      expectedFlightIds.every((id, i) => id === actualFlightIds[i]);
    if (!matches) {
      return next(
        new Error(
          `Hành khách "${p.full_name}" có ghế không khớp đúng các chặng bay của booking.`
        )
      );
    }
  }
  next();
});

module.exports = mongoose.models.Booking || mongoose.model("Booking", BookingSchema);
