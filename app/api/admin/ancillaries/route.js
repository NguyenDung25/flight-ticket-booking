import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { logAdminAction } from "@/lib/adminLog";
import { getAncillaryPricingInfo, updateAncillaryPricing } from "@/services/ancillaryPricingService";

export async function GET() {
  try {
    await dbConnect();
    await requireAdminUser();
    return NextResponse.json(await getAncillaryPricingInfo());
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ancillaries");
  }
}

export async function PUT(request) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const body = await request.json().catch(() => null);
    const pricing = await updateAncillaryPricing({ raw: body?.pricing, adminId: admin._id });

    const packages = pricing.baggage_packages.map((p) => `${p.kg}kg ${p.price.toLocaleString("vi-VN")}đ`).join(", ");
    await logAdminAction(admin, {
      action: "ancillary.update",
      targetType: "setting",
      targetId: "ancillary_pricing",
      summary: "Cập nhật bảng giá hành lý & suất ăn",
      details: {
        carry_on_kg: pricing.carry_on_kg,
        included_economy_kg: pricing.included_checked_kg.economy,
        included_business_kg: pricing.included_checked_kg.business,
        baggage_packages: packages || "không có gói",
        meal_economy: pricing.meal_included.economy ? "đã gồm" : pricing.meal_price.economy,
        meal_business: pricing.meal_included.business ? "đã gồm" : pricing.meal_price.business,
      },
    });
    return NextResponse.json({ pricing });
  } catch (err) {
    return handleApiError(err, "PUT /api/admin/ancillaries");
  }
}
