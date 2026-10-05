// app/api/admin/flights/[id]/route.js
//
// A1 — xem/sửa/xóa 1 chuyến bay. PATCH CHỈ cho sửa field không ảnh hưởng cấu
// trúc ghế đã sinh (giờ bay, giá, status) — `aircraft_id` KHÔNG được sửa sau
// khi tạo (đúng comment trong models/Flight.js: sửa aircraft_id sẽ làm lệch
// hẳn seats[] đã sinh, không có cơ chế re-sync) — nếu body có gửi kèm
// `aircraft_id` khác giá trị hiện tại, từ chối rõ ràng (400) thay vì âm thầm
// bỏ qua, đúng ghi chú (v): "PUT luôn từ chối nếu body chứa aircraft_id khác
// giá trị hiện tại (bất kể có booking hay không)".
//
// Hủy chuyến bay THẬT SỰ (kèm cascade hủy toàn bộ booking liên quan, A8) là
// 1 hành động RIÊNG, có route riêng (POST .../cancel-bulk) — route PATCH này
// CHỈ đổi field trên chính Flight, KHÔNG tự động đụng tới Booking nào.
//
// Ghi chú (v): sửa departure_time hoặc XÓA chuyến bay khi đã có booking hiệu
// lực (pending_payment/confirmed) sẽ làm sai lệch dữ liệu vé đã bán — cả 2
// hành động BẮT BUỘC đi qua flightService.assertNoActiveBooking() trước khi
// động vào DB. Sửa base_price/status/flight_number không cần chặn (không ảnh
// hưởng gì tới vé đã bán).

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";
import { assertNoActiveBooking } from "@/services/flightService";
// Side-effect import — KHÔNG dùng biến này, chỉ cần chạy mongoose.model("Airline"/
// "Aircraft", ...) trước khi .populate() bên dưới gọi tới. Không có 2 dòng
// này, Next.js/Turbopack bundle route này riêng ở dev có thể KHÔNG bao giờ
// nạp 2 model đó, khiến populate ném MissingSchemaError (xem comment đầy đủ
// ở services/flightService.js — cùng 1 lớp bug).
import "@/models/Airline";
import "@/models/Aircraft";

const EDITABLE_FIELDS = [
  "flight_number",
  "origin_code",
  "dest_code",
  "departure_time",
  "arrival_time",
  "base_price",
  "status",
];

export async function GET(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;
    const flight = await Flight.findById(id)
      .populate("airline_id", "code name")
      .populate("aircraft_id", "name");

    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    return NextResponse.json(flight);
  } catch (err) {
    return handleApiError(err, "GET /api/admin/flights/[id]");
  }
}

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;
    const body = await request.json();

    // aircraft_id không nằm trong EDITABLE_FIELDS nên vốn đã bị bỏ qua khi
    // build `updates` bên dưới — nhưng nếu client cố tình gửi kèm 1 giá trị
    // KHÁC aircraft_id hiện tại, phải báo lỗi rõ ràng (400) thay vì lặng lẽ
    // bỏ qua khiến client tưởng đã đổi thành công (đúng ghi chú v).
    if (body?.aircraft_id !== undefined) {
      const current = await Flight.findById(id).select("aircraft_id");
      if (!current) {
        return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
      }
      if (String(current.aircraft_id) !== String(body.aircraft_id)) {
        return NextResponse.json(
          {
            message:
              "Không thể đổi aircraft_id của chuyến bay đã tạo — seats[] đã được sinh cố định theo loại máy bay lúc tạo. Muốn đổi, xóa chuyến (nếu chưa có booking) và tạo lại.",
          },
          { status: 400 }
        );
      }
    }

    // Chỉ lấy đúng field cho phép sửa — bỏ qua mọi field khác (kể cả nếu
    // client cố tình gửi aircraft_id/seats/airline_id lên, đã xử lý riêng ở
    // trên khi aircraft_id thực sự khác giá trị hiện tại).
    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (body?.[field] !== undefined) updates[field] = body[field];
    }
    if (updates.origin_code) updates.origin_code = updates.origin_code.toUpperCase();
    if (updates.dest_code) updates.dest_code = updates.dest_code.toUpperCase();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "Không có field hợp lệ nào để cập nhật." }, { status: 400 });
    }

    // Ghi chú (v): đổi departure_time trên 1 chuyến đã có booking hiệu lực
    // sẽ làm sai lệch vé đã bán (vé điện tử/boarding pass đã phát ghi giờ
    // cũ) — chặn cứng ở đây TRƯỚC khi ghi DB. Không chặn khi chỉ sửa
    // base_price/status/flight_number (không ảnh hưởng gì tới vé đã bán).
    if (updates.departure_time) {
      await assertNoActiveBooking(id); // throws FlightError 409 nếu có
    }

    const flight = await Flight.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });
    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    return NextResponse.json(flight);
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/flights/[id]");
  }
}

/**
 * A1 (ghi chú v) — xóa hẳn 1 chuyến bay, CHỈ khi không còn booking hiệu lực
 * nào phụ thuộc (pending_payment/confirmed) — đúng
 * `mongodb-schema-design.md` liệt kê `DELETE /api/admin/flights`. Chưa từng
 * có route này trước đây; UI admin (FlightsTable.jsx) hiện chưa có nút Xóa,
 * chỉ mới thêm API — nối nút bấm ở UI là việc riêng, tách khỏi PATCH ở trên.
 */
export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;

    await assertNoActiveBooking(id); // throws FlightError 409 nếu có

    const flight = await Flight.findByIdAndDelete(id);
    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    return NextResponse.json({ message: "Đã xóa chuyến bay.", id });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/flights/[id]");
  }
}
