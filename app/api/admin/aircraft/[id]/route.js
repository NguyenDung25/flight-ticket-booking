// app/api/admin/aircraft/[id]/route.js
//
// A2 — sửa / xóa 1 loại máy bay (bổ sung cho app/api/admin/aircraft/route.js chỉ có GET/POST).
//
// PUT (cũng nhận PATCH): đổi `name` và/hoặc thay cả `seat_map_template` + `total_seats`.
// Sửa template KHÔNG ảnh hưởng chuyến bay đã tạo — Flight.seats[] là bản deep copy tại
// thời điểm tạo chuyến (ghi chú u), nên chỉ các chuyến bay TẠO SAU mới dùng sơ đồ mới.
//
// DELETE: chặn (409) nếu còn Flight dùng loại máy bay này (Flight.aircraft_id).

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { ActiveUserError } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Aircraft from "@/models/Aircraft";
import Flight from "@/models/Flight";

const SEAT_CLASSES = ["economy", "business"];

function assertValidId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ActiveUserError("ID máy bay không hợp lệ.", 400);
  }
}

/** Kiểm tra từng ghế hợp lệ + không trùng số ghế. Ném 400 nếu sai. */
function assertValidSeatMap(seatMap) {
  const seen = new Set();
  for (const seat of seatMap) {
    const num = typeof seat?.seat_number === "string" ? seat.seat_number.trim() : "";
    if (!num) {
      throw new ActiveUserError("Mọi ghế trong seat_map_template phải có seat_number.", 400);
    }
    if (!SEAT_CLASSES.includes(seat.seat_class)) {
      throw new ActiveUserError(
        `Ghế ${num} có seat_class không hợp lệ (chỉ nhận: ${SEAT_CLASSES.join(", ")}).`,
        400
      );
    }
    if (seen.has(num)) {
      throw new ActiveUserError(`Số ghế ${num} bị trùng trong seat_map_template.`, 400);
    }
    seen.add(num);
  }
}

async function update(request, { params }, context) {
  try {
    await dbConnect();
    await requireAdminUser();
    const { id } = await params;
    assertValidId(id);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ActiveUserError("Body không hợp lệ.", 400);
    }

    const $set = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new ActiveUserError("name không được để trống.", 400);
      $set.name = name;
    }

    if (body.seat_map_template !== undefined) {
      if (!Array.isArray(body.seat_map_template) || body.seat_map_template.length === 0) {
        throw new ActiveUserError("seat_map_template phải là mảng có ít nhất 1 ghế.", 400);
      }
      assertValidSeatMap(body.seat_map_template);
      // total_seats luôn tính từ chính template — không tin con số client gửi riêng.
      if (
        body.total_seats !== undefined &&
        Number(body.total_seats) !== body.seat_map_template.length
      ) {
        throw new ActiveUserError(
          `seat_map_template có ${body.seat_map_template.length} ghế nhưng total_seats khai báo ${body.total_seats} — kiểm tra lại trước khi lưu.`,
          400
        );
      }
      $set.seat_map_template = body.seat_map_template.map((s) => ({
        seat_number: s.seat_number.trim(),
        seat_class: s.seat_class,
      }));
      $set.total_seats = body.seat_map_template.length;
    } else if (body.total_seats !== undefined) {
      throw new ActiveUserError("Muốn đổi total_seats phải gửi kèm seat_map_template mới.", 400);
    }

    if (Object.keys($set).length === 0) {
      throw new ActiveUserError("Không có trường nào để cập nhật.", 400);
    }

    const aircraft = await Aircraft.findByIdAndUpdate(id, { $set }, { returnDocument: "after", runValidators: true });
    if (!aircraft) {
      throw new ActiveUserError("Không tìm thấy máy bay.", 404);
    }

    return NextResponse.json(aircraft);
  } catch (err) {
    return handleApiError(err, context);
  }
}

export async function PUT(request, ctx) {
  return update(request, ctx, "PUT /api/admin/aircraft/[id]");
}

export async function PATCH(request, ctx) {
  return update(request, ctx, "PATCH /api/admin/aircraft/[id]");
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();
    const { id } = await params;
    assertValidId(id);

    const aircraft = await Aircraft.findById(id);
    if (!aircraft) {
      throw new ActiveUserError("Không tìm thấy máy bay.", 404);
    }

    const flightCount = await Flight.countDocuments({ aircraft_id: id });
    if (flightCount > 0) {
      throw new ActiveUserError(
        `Không thể xóa: còn ${flightCount} chuyến bay đang dùng loại máy bay này.`,
        409
      );
    }

    await aircraft.deleteOne();
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/aircraft/[id]");
  }
}
