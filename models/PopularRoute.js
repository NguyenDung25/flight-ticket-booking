// models/PopularRoute.js
//
// Danh sách "Tuyến bay phổ biến" hiển thị ở trang chủ khách (carousel thẻ) — admin quản lý trong
// Admin → Chuyến bay → tab "Tuyến phổ biến". Mỗi tuyến: cặp sân bay, bật/ẩn, thứ tự, và (tùy chọn) ảnh nền
// lưu NGAY TRONG MongoDB (<= 1MB, JPEG/PNG/WebP — xem lib/imageSniff.js) để chạy được cả khi triển khai
// lên host không cho ghi file. Giá "Từ ..." và chuyến gần nhất KHÔNG lưu ở đây: luôn tính từ chuyến bay
// thật (services/routeStatsService.js).
//
// Collection RỖNG = chưa tùy chỉnh -> trang chủ dùng danh sách mặc định trong lib/popularRoutes.js.

const mongoose = require("mongoose");
const { Schema } = mongoose;

const PopularRouteSchema = new Schema(
  {
    origin_code: { type: String, required: true, uppercase: true, trim: true },
    dest_code: { type: String, required: true, uppercase: true, trim: true },
    active: { type: Boolean, default: true },
    sort_order: { type: Number, required: true, default: 0 },
    image: {
      // select:false — danh sách/trang chủ KHÔNG kéo cả ảnh nhị phân; chỉ route ảnh mới .select("+image.data")
      data: { type: Buffer, select: false },
      content_type: { type: String },
      size: { type: Number },
      updated_at: { type: Date },
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

PopularRouteSchema.index({ origin_code: 1, dest_code: 1 }, { unique: true });
PopularRouteSchema.index({ sort_order: 1 });

PopularRouteSchema.pre("validate", function () {
  if (this.origin_code === this.dest_code) {
    throw new Error("Điểm đi và điểm đến không được trùng nhau.");
  }
});

module.exports = mongoose.models.PopularRoute || mongoose.model("PopularRoute", PopularRouteSchema);
