import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import Promotion from "@/models/Promotion";
import { dayRangeVN } from "@/lib/timezone";
import { logAdminAction } from "@/lib/adminLog";

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
    const admin = await requireAdminUser();

    const body = await request.json().catch(() => null);
    const { code, discount_percent, valid_from, valid_until, usage_limit } = body ?? {};

    if (!code || discount_percent === undefined || !valid_from || !valid_until) {
      return NextResponse.json(
        { message: "code, discount_percent, valid_from, valid_until đều là bắt buộc." },
        { status: 400 }
      );
    }

    // Lỗi đã sửa (đúng lớp lỗi ghi chú (ab) ở lib/timezone.js).
    const { start: validFromVN } = dayRangeVN(valid_from);
    const { end: validUntilVN } = dayRangeVN(valid_until);

    const promotion = await Promotion.create({
      code: String(code).trim(),
      discount_percent: Number(discount_percent),
      valid_from: validFromVN,
      valid_until: validUntilVN,
      // "" (input number để trống) và undefined đều phải thành null.
      usage_limit: usage_limit === "" || usage_limit === undefined ? null : Number(usage_limit),
    });
    await logAdminAction(admin, {
      action: "promotion.create", targetType: "promotion", targetId: promotion._id,
      summary: `Tạo mã khuyến mãi ${promotion.code} (giảm ${promotion.discount_percent}%)`,
    });
    return NextResponse.json(promotion, { status: 201 });
  } catch (err) {
    return handleApiError(err, "POST /api/admin/promotions");
  }
}
