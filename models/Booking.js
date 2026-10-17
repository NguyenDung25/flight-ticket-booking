const mongoose = require("mongoose");
const { Schema } = mongoose;

const PassengerSeatSchema = new Schema(
  {
    flight_id: { type: Schema.Types.ObjectId, ref: "Flight", required: true }, // 1 phần tử / chặng
    seat_number: { type: String, required: true },
    seat_class: { type: String, enum: ["economy", "business"], required: true }, // gắn theo từng khách (ghi chú m)
    // Dịch vụ bổ sung của khách này trên chặng này (lib/ancillaries.js) — server tự tính giá, ghi lại giá lúc đặt.
    baggage_kg: { type: Number, default: 0 }, // hành lý ký gửi mua thêm (chưa gồm phần miễn phí theo hạng)
    meal: { type: Boolean, default: false },
    addons_amount: { type: Number, default: 0 },
    // Số kg tại lúc đặt (admin đổi bảng giá sau đó không làm đổi vé đã bán).
    carry_on_kg: { type: Number },
    checked_baggage_kg: { type: Number }, // tổng ký gửi được mang = đã gồm theo hạng + mua thêm
  },
  { _id: false }
);

const PassengerSchema = new Schema(
  {
    full_name: { type: String, required: true },
    // Ghi chú aa: document_id vẫn là 1 trường String chung.
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
    amount: { type: Number, required: true }, // Σ giá theo seat_class + dịch vụ bổ sung từng khách trên chặng này (ghi chú t)
    addons_amount: { type: Number, default: 0 }, // phần dịch vụ bổ sung trong amount (trước giảm giá)
  },
  { _id: false }
);

const ExtraPaymentSchema = new Schema(
  {
    trans_id: { type: String, required: true },
    order_id: { type: String },
    amount: { type: Number },
    received_at: { type: Date },
  },
  { _id: false }
);

const PaymentSchema = new Schema(
  {
    method: { type: String, default: "vnpay" },
    // Không đặt `default: null` — sparse unique index (bên dưới) chỉ loại trừ document mà field hoàn toàn vắng mặt.
    transaction_id: { type: String }, // unique + sparse (ghi chú i)
    paid_at: { type: Date, default: null },
    payment_expires_at: { type: Date, default: null }, // = held_until − 5 phút (ghi chú y)
    // Mã đơn hàng (vnp_TxnRef) của lần tạo thanh toán VNPay gần nhất + thời điểm tạo.
    last_order_id: { type: String },
    last_order_date: { type: String },
    // Khoản thanh toán thừa (khách trả 2 lần cho 1 booking) — admin hoàn tay.
    extra_payments: { type: [ExtraPaymentSchema], default: undefined },
  },
  { _id: false }
);

const BookingSchema = new Schema(
  {
    // Cùng lý do transaction_id ở trên — không đặt default: null.
    booking_code: { type: String }, // sinh sau khi thanh toán thành công (C7)
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true }, // bắt buộc (ghi chú a)
    trip_type: { type: String, enum: ["one_way", "round_trip"], required: true },
    locale: { type: String, enum: ["vi", "en"], required: true }, // chụp User.preferred_language lúc đặt

    flights: { type: [FlightLegSchema], default: [] },
    passengers: { type: [PassengerSchema], default: [] },

    promotion_id: { type: Schema.Types.ObjectId, ref: "Promotion", default: null },

    // Người liên hệ của booking (lib/bookingContact.js) — vé điện tử gửi về contact.email.
    contact: {
      type: new Schema({ email: { type: String }, phone: { type: String } }, { _id: false }),
      default: undefined,
    },
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

    // C7 — lần gần nhất gửi email vé điện tử thành công (null = chưa gửi được lần nào, VD SMTP chưa cấu hình).
    ticket_emailed_at: { type: Date, default: null },
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

// --- Validate tầng schema mức cơ bản --- passengers[].seats phải khớp đúng tập hợp flight_id của flights[].
BookingSchema.pre("validate", function () {
  // Mongoose 9 đã bỏ callback-style middleware (tham số next) — báo lỗi bằng throw.
  const expectedFlightIds = this.flights.map((f) => String(f.flight_id)).sort();
  for (const p of this.passengers) {
    const actualFlightIds = p.seats.map((s) => String(s.flight_id)).sort();
    const matches =
      actualFlightIds.length === expectedFlightIds.length &&
      expectedFlightIds.every((id, i) => id === actualFlightIds[i]);
    if (!matches) {
      throw new Error(
        `Hành khách "${p.full_name}" có ghế không khớp đúng các chặng bay của booking.`
      );
    }
  }
});

module.exports = mongoose.models.Booking || mongoose.model("Booking", BookingSchema);
