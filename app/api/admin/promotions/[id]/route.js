// app/api/admin/promotions/[id]/route.js
//
// A5 — sửa/xóa mã khuyến mãi (bổ sung cho route.js chỉ có GET/POST, đúng đặc
// tả "POST/PUT/DELETE /api/admin/promotions").
//
// PATCH — chỉ cho sửa discount_percent, valid_from, valid_until, usage_limit.
// KHÔNG cho sửa `code` (mã đã in/gửi cho khách, đổi mã = 1 mã khác hẳn — muốn
// đổi thì xóa và tạo mới) và KHÔNG cho sửa `used_count` (do
// Promotion.incrementUsage() tự tăng atomic). Dùng findById + save() (không
// phải findByIdAndUpdate) để pre-validate của model (valid_until > valid_from)
// luôn chạy trên GIÁ TRỊ SAU KHI GỘP với dữ liệu cũ; save() chỉ ghi các path đã
// đổi nên không đè lên used_count đang được tăng đồng thời bởi booking khác.
//
// Ngày nhận "YYYY-MM-DD" -> quy đổi qua dayRangeVN() y hệt route POST (ghi chú
// ab): valid_from = 00:00 VN của ngày chọn, valid_until = 00:00 VN của NGÀY
// KẾ TIẾP (mã còn dùng được hết ngày "Đến ngày").
//
// DELETE — chặn (409) nếu đã có booking dùng mã (Booking.promotion_id): xóa sẽ
// làm booking cũ trỏ tới mã không còn tồn tại. Muốn ngừng dùng thì sửa
// valid_until cho hết hạn.

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Promotion from "@/models/Promotion";
import Booking from "@/models/Booking";
import { dayRangeVN } from "@/lib/timezone";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(message) {
  return NextResponse.json({ message }, { status: 400 });
}

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return badRequest("ID khuyến mãi không hợp lệ.");

    const body = (await request.json().catch(() => null)) ?? {};
    const promotion = await Promotion.findById(id);
    if (!promotion) {
      return NextResponse.json({ message: "Không tìm thấy mã khuyến mãi." }, { status: 404 });
    }

    if (body.discount_percent !== undefined) {
      const percent = Number(body.discount_percent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return badRequest("discount_percent phải nằm trong khoảng 0–100.");
      }
      promotion.discount_percent = percent;
    }

    if (body.valid_from !== undefined) {
      if (!DATE_ONLY.test(body.valid_from)) return badRequest("valid_from phải có dạng YYYY-MM-DD.");
      promotion.valid_from = dayRangeVN(body.valid_from).start;
    }
    if (body.valid_until !== undefined) {
      if (!DATE_ONLY.test(body.valid_until)) return badRequest("valid_until phải có dạng YYYY-MM-DD.");
      promotion.valid_until = dayRangeVN(body.valid_until).end;
    }

    if (body.usage_limit !== undefined) {
      // "" / null = không giới hạn (đúng 2 dạng Promotion.incrementUsage xử lý).
      const limit = body.usage_limit === "" || body.usage_limit === null ? null : Number(body.usage_limit);
      if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
        return badRequest("usage_limit phải là số nguyên ≥ 1 (hoặc để trống = không giới hạn).");
      }
      if (limit !== null && limit < promotion.used_count) {
        return badRequest(`Mã đã được dùng ${promotion.used_count} lượt, không thể đặt giới hạn thấp hơn.`);
      }
      promotion.usage_limit = limit;
    }

    await promotion.save(); // pre-validate: valid_until phải sau valid_from
    return NextResponse.json(promotion);
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/promotions/[id]");
  }
}

export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return badRequest("ID khuyến mãi không hợp lệ.");

    if (await Booking.exists({ promotion_id: id })) {
      return NextResponse.json(
        {
          message:
            "Mã này đã được dùng trong booking, không thể xóa. Hãy sửa ngày hết hạn để ngừng áp dụng.",
        },
        { status: 409 }
      );
    }

    const deleted = await Promotion.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ message: "Không tìm thấy mã khuyến mãi." }, { status: 404 });
    }
    return NextResponse.json({ message: "Đã xóa mã khuyến mãi.", id });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/promotions/[id]");
  }
}
