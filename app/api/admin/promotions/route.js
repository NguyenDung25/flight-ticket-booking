// app/api/admin/promotions/route.js
//
// A5 — CRUD mã khuyến mãi. Route này: GET (danh sách) + POST (tạo); sửa/xóa ở [id]/route.js.
// kế hoạch). Cùng mức tối giản với A2 (app/api/admin/aircraft,
// app/api/admin/airlines): chỉ GET (danh sách) + POST (tạo mới), KHÔNG có
// sửa/xóa — sai sót thường chỉ là gõ nhầm ngày/số %, tạo mã mới rồi bỏ mã cũ
// (không dùng nữa tự hết hạn qua valid_until) đơn giản hơn build thêm route
// sửa cho 1 collection ít thay đổi.
//
// Model (models/Promotion.js) đã tự validate valid_until > valid_from (pre-
// validate) và unique code (index) — route chỉ cần bắt lỗi đó qua
// handleApiError (ghi chú chung: Mongoose ValidationError/duplicate key đều
// đã được handleApiError nhận diện, xem lib/apiError.js), không tự viết lại
// check trùng lặp ở đây.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Promotion from "@/models/Promotion";
import { dayRangeVN } from "@/lib/timezone";

export async function GET() {
  try {
    await dbConnect();
    await requireAdminUser();

    const promotions = await Promotion.find().sort({ created_at: -1 });
    return NextResponse.json(promotions);
  } catch (err) {
    return handleApiError(err, "GET /api/admin/promotions");
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    await requireAdminUser();

    const body = await request.json();
    const { code, discount_percent, valid_from, valid_until, usage_limit } = body ?? {};

    if (!code || discount_percent === undefined || !valid_from || !valid_until) {
      return NextResponse.json(
        { message: "code, discount_percent, valid_from, valid_until đều là bắt buộc." },
        { status: 400 }
      );
    }

    // BUG ĐÃ SỬA (đúng lớp lỗi ghi chú (ab) ở lib/timezone.js): valid_from/
    // valid_until là input type="date" trên UI (chỉ có "YYYY-MM-DD", không
    // có giờ) — new Date("2026-09-25") trần bị JS parse là 00:00:00 UTC =
    // 07:00 SÁNG giờ VN, KHÔNG phải nửa đêm giờ VN như admin chọn. Phải đi
    // qua dayRangeVN() (cùng hàm C1 dùng để tìm chuyến bay theo ngày) để quy
    // đổi đúng theo Asia/Ho_Chi_Minh:
    // - valid_from  = dayRangeVN(valid_from).start  -> đúng 00:00:00 giờ VN
    //   của ngày admin chọn.
    // - valid_until = dayRangeVN(valid_until).end    -> 00:00:00 giờ VN của
    //   NGÀY KẾ TIẾP sau ngày admin chọn (không phải chính ngày đó) — để mã
    //   còn hiệu lực xuyên suốt tới 23:59:59.999 giờ VN của "Đến ngày", đúng
    //   ý nghĩa người dùng thường hiểu ("hết hạn ngày X" = còn dùng được cả
    //   ngày X), không cắt cụt mã lúc 7h sáng ngày X.
    const { start: validFromVN } = dayRangeVN(valid_from);
    const { end: validUntilVN } = dayRangeVN(valid_until);

    const promotion = await Promotion.create({
      code: String(code).trim(),
      discount_percent: Number(discount_percent),
      valid_from: validFromVN,
      valid_until: validUntilVN,
      // "" (input number để trống) và undefined đều phải thành null — đúng
      // 2 dạng "không giới hạn" mà Promotion.incrementUsage() đã xử lý
      // (ghi chú p ở models/Promotion.js), KHÔNG được lưu thành 0 hay NaN.
      usage_limit: usage_limit === "" || usage_limit === undefined ? null : Number(usage_limit),
    });
    return NextResponse.json(promotion, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/promotions");
  }
}
