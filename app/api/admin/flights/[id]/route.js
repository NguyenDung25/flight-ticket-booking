import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";
import Booking from "@/models/Booking";
import { assertNoActiveBooking } from "@/services/flightService";
import { validatePatch, changedSensitiveFields } from "@/lib/flightPatchRules";
// Side-effect import — không dùng biến này, chỉ cần chạy mongoose.model.
import "@/models/Airline";
import "@/models/Aircraft";
import { logAdminAction } from "@/lib/adminLog";

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
    const admin = await requireAdminUser();

    const { id } = await params;
    const body = await request.json();

    // aircraft_id không nằm trong EDITABLE_FIELDS nên vốn đã bị bỏ qua khi build `updates` bên dưới.
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

    // Chỉ lấy đúng field cho phép sửa — bỏ qua mọi field khác.
    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (body?.[field] !== undefined) updates[field] = body[field];
    }
    if (updates.origin_code) updates.origin_code = updates.origin_code.toUpperCase();
    if (updates.dest_code) updates.dest_code = updates.dest_code.toUpperCase();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: "Không có field hợp lệ nào để cập nhật." }, { status: 400 });
    }

    // Đọc bản ghi hiện có 1 lần để validate chéo và so sánh giá trị thật.
    const current = await Flight.findById(id).select(
      "departure_time arrival_time origin_code dest_code base_price seats"
    );
    if (!current) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }

    // L2/L3: findByIdAndUpdate không chạy pre("validate") nên kiểm tra tay; đồng thời từ chối status "cancelled".
    validatePatch(updates, {
      departure_time: current.departure_time,
      arrival_time: current.arrival_time,
      origin_code: current.origin_code,
      dest_code: current.dest_code,
      base_price: current.base_price,
      hasBusinessSeats: current.seats?.some((s) => s.seat_class === "business"),
    });

    // Ghi chú (v): chỉ chặn khi field nhạy cảm thực sự đổi giá trị.
    if (changedSensitiveFields(updates, current).length > 0) {
      await assertNoActiveBooking(id); // throws FlightError 409 nếu có
    }

    const flight = await Flight.findByIdAndUpdate(id, { $set: updates }, { returnDocument: "after", runValidators: true });
    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    // Tài liệu (v/A8): đổi status → cancelled là sửa trạng thái đơn thuần, không tự hủy booking.
    const body2 = flight.toObject();
    if (updates.status === "cancelled") {
      const stranded = await Booking.exists({
        "flights.flight_id": flight._id,
        status: { $in: ["pending_payment", "confirmed"] },
      });
      if (stranded) {
        body2.warning =
          "Chuyến đã chuyển 'cancelled' nhưng vẫn còn booking hiệu lực. Hãy bấm 'Hủy chuyến & xử lý vé liên quan' (A8) để hoàn tiền cho khách.";
      }
    }
    await logAdminAction(admin, {
      action: "flight.update", targetType: "flight", targetId: id,
      summary: `Sửa chuyến ${flight.flight_number}${updates.status === "cancelled" ? " (chuyển trạng thái hủy)" : ""}`,
      details: { fields: Object.keys(updates).join(", ") },
    });
    return NextResponse.json(body2);
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/flights/[id]");
  }
}

/** A1 (ghi chú v) — xóa hẳn 1 chuyến bay, chỉ khi không còn booking hiệu lực nào phụ thuộc. */
export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();

    const { id } = await params;

    await assertNoActiveBooking(id); // throws FlightError 409 nếu có

    const flight = await Flight.findByIdAndDelete(id);
    if (!flight) {
      return NextResponse.json({ message: "Không tìm thấy chuyến bay." }, { status: 404 });
    }
    await logAdminAction(admin, {
      action: "flight.delete", targetType: "flight", targetId: id,
      summary: `Xóa chuyến ${flight.flight_number} (${flight.origin_code} → ${flight.dest_code})`,
    });
    return NextResponse.json({ message: "Đã xóa chuyến bay.", id });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/flights/[id]");
  }
}
