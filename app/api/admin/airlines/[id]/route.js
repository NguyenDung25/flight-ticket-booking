// app/api/admin/airlines/[id]/route.js
//
// A2 — sửa / xóa 1 hãng bay (bổ sung cho app/api/admin/airlines/route.js chỉ có GET/POST).
//
// PUT (cũng nhận PATCH): thay `code` + `name.vi` + `name.en`. Cả 3 đều bắt buộc —
// đúng như lúc tạo — để không vô tình để trống tên 1 ngôn ngữ (C11 hiển thị cả 2).
//
// DELETE: chặn (409) nếu còn Flight nào đang tham chiếu hãng này (Flight.airline_id),
// tránh để lại chuyến bay "mồ côi" không hiển thị được tên hãng.

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { ActiveUserError } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Airline from "@/models/Airline";
import Flight from "@/models/Flight";

function assertValidId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ActiveUserError("ID hãng bay không hợp lệ.", 400);
  }
}

async function update(request, { params }, context) {
  try {
    await dbConnect();
    await requireAdminUser();
    const { id } = await params;
    assertValidId(id);

    const body = await request.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const nameVi = typeof body?.name?.vi === "string" ? body.name.vi.trim() : "";
    const nameEn = typeof body?.name?.en === "string" ? body.name.en.trim() : "";

    if (!code || !nameVi || !nameEn) {
      throw new ActiveUserError("code, name.vi, name.en đều là bắt buộc.", 400);
    }

    const airline = await Airline.findByIdAndUpdate(
      id,
      { $set: { code: code.toUpperCase(), "name.vi": nameVi, "name.en": nameEn } },
      { returnDocument: "after", runValidators: true }
    );
    if (!airline) {
      throw new ActiveUserError("Không tìm thấy hãng bay.", 404);
    }

    return NextResponse.json(airline);
  } catch (err) {
    return handleApiError(err, context);
  }
}

export async function PUT(request, ctx) {
  return update(request, ctx, "PUT /api/admin/airlines/[id]");
}

export async function PATCH(request, ctx) {
  return update(request, ctx, "PATCH /api/admin/airlines/[id]");
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();
    const { id } = await params;
    assertValidId(id);

    const airline = await Airline.findById(id);
    if (!airline) {
      throw new ActiveUserError("Không tìm thấy hãng bay.", 404);
    }

    const flightCount = await Flight.countDocuments({ airline_id: id });
    if (flightCount > 0) {
      throw new ActiveUserError(
        `Không thể xóa: còn ${flightCount} chuyến bay thuộc hãng này. Xóa/chuyển các chuyến bay đó trước.`,
        409
      );
    }

    await airline.deleteOne();
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/airlines/[id]");
  }
}
