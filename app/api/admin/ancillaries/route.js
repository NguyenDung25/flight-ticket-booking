import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { logAdminAction } from "@/lib/adminLog";
import Airline from "@/models/Airline";
import {
  getAncillaryPricingInfo,
  updateAncillaryPricing,
  resetAirlinePricing,
} from "@/services/ancillaryPricingService";

/** Mã hãng từ query/body: rỗng = bảng chung; có mã thì hãng phải tồn tại. Trả { code } hoặc { error }. */
async function resolveAirline(value) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!code) return { code: "" };
  const exists = await Airline.exists({ code });
  return exists ? { code } : { error: NextResponse.json({ message: "Hãng bay không tồn tại." }, { status: 404 }) };
}

export async function GET(request) {
  try {
    await dbConnect();
    await requireAdminUser();
    const airline = await resolveAirline(new URL(request.url).searchParams.get("airline"));
    if (airline.error) return airline.error;
    return NextResponse.json(await getAncillaryPricingInfo(airline.code));
  } catch (err) {
    return handleApiError(err, "GET /api/admin/ancillaries");
  }
}

export async function PUT(request) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const body = await request.json().catch(() => null);
    const airline = await resolveAirline(body?.airline);
    if (airline.error) return airline.error;
    const pricing = await updateAncillaryPricing({ raw: body?.pricing, adminId: admin._id, airlineCode: airline.code });

    const packages = pricing.baggage_packages.map((p) => `${p.kg}kg ${p.price.toLocaleString("vi-VN")}đ`).join(", ");
    await logAdminAction(admin, {
      action: "ancillary.update",
      targetType: "setting",
      targetId: airline.code ? `ancillary_pricing:${airline.code}` : "ancillary_pricing",
      summary: airline.code
        ? `Cập nhật bảng giá hành lý & suất ăn của hãng ${airline.code}`
        : "Cập nhật bảng giá hành lý & suất ăn (chung)",
      details: {
        airline: airline.code || "chung",
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

/** Xóa bảng giá riêng của một hãng -> hãng dùng lại bảng chung. Không xóa được bảng chung. */
export async function DELETE(request) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const airline = await resolveAirline(new URL(request.url).searchParams.get("airline"));
    if (airline.error) return airline.error;
    if (!airline.code) {
      return NextResponse.json({ message: "Chỉ xóa được bảng giá riêng của một hãng." }, { status: 400 });
    }
    await resetAirlinePricing(airline.code);
    await logAdminAction(admin, {
      action: "ancillary.reset",
      targetType: "setting",
      targetId: `ancillary_pricing:${airline.code}`,
      summary: `Hãng ${airline.code} dùng lại bảng giá hành lý & suất ăn chung`,
    });
    return NextResponse.json({ ...(await getAncillaryPricingInfo(airline.code)) });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/ancillaries");
  }
}
