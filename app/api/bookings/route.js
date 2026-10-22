import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { requireVerifiedEmail } from "@/lib/requireVerifiedEmail";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";
import Booking from "@/models/Booking";
import { validateBookingCreation } from "@/services/bookingValidationService";
import { applyPromotion, applyDiscountToLegs } from "@/services/promotionService";
import {
  PAYMENT_EXPIRY_BUFFER_MS,
  MAX_PENDING_BOOKINGS_PER_USER,
  PAYMENT_MIN_AMOUNT,
  PAYMENT_MAX_AMOUNT,
} from "@/config/constants";
import Promotion from "@/models/Promotion";
import { normalizeContact } from "@/lib/bookingContact";
import { getAncillaryPricing } from "@/services/ancillaryPricingService";

/** payment.payment_expires_at (ghi chú y) = held_until của ghế giữ sớm nhất trong toàn booking, trừ đi buffer. */
function earliestHeldUntil(flightDocs, passengers) {
  let earliest = null;
  for (const passenger of passengers) {
    for (const seat of passenger.seats) {
      const flightDoc = flightDocs.find(
        (f) => String(f._id) === String(seat.flight_id)
      );
      const seatDoc = flightDoc?.seats.find(
        (s) => s.seat_number === seat.seat_number
      );
      if (seatDoc?.held_until && (!earliest || seatDoc.held_until < earliest)) {
        earliest = seatDoc.held_until;
      }
    }
  }
  return earliest;
}

export async function POST(request) {
  try {
    await dbConnect();

    const session = await auth();
    const user = requireVerifiedEmail(await requireActiveUser(session));

    const body = await request.json().catch(() => ({}));
    const { trip_type, flights, passengers, promotion_code } = body ?? {};
    // Người liên hệ (email nhận vé điện tử + số điện thoại) — bắt buộc với booking mới.
    const contact = normalizeContact(body?.contact);

    if (!["one_way", "round_trip"].includes(trip_type)) {
      return NextResponse.json(
        { message: "trip_type phải là 'one_way' hoặc 'round_trip'." },
        { status: 400 }
      );
    }
    const expectedLegCount = trip_type === "round_trip" ? 2 : 1;
    if (!Array.isArray(flights) || flights.length !== expectedLegCount) {
      return NextResponse.json(
        {
          message: `trip_type '${trip_type}' cần đúng ${expectedLegCount} chặng trong flights[].`,
        },
        { status: 400 }
      );
    }
    // Bắt buộc validate leg trước khi gọi validateBookingCreation.
    const legNames = flights.map((f) => f?.leg).sort();
    const validLegShape =
      trip_type === "round_trip"
        ? legNames[0] === "outbound" && legNames[1] === "return"
        : legNames[0] === "outbound";
    if (!validLegShape) {
      return NextResponse.json(
        {
          message:
            trip_type === "round_trip"
              ? "flights[] khứ hồi cần đúng 1 chặng leg='outbound' và 1 chặng leg='return'."
              : "flights[] một chiều cần leg='outbound'.",
        },
        { status: 400 }
      );
    }
    if (!Array.isArray(passengers) || passengers.length === 0) {
      return NextResponse.json(
        { message: "Cần ít nhất 1 hành khách." },
        { status: 400 }
      );
    }

    // flight_id sai định dạng ObjectId.
    const badIdIndex = flights.findIndex(
      (f) => !mongoose.isValidObjectId(f?.flight_id)
    );
    if (badIdIndex !== -1) {
      return NextResponse.json(
        { message: `flights[${badIdIndex}].flight_id không hợp lệ.` },
        { status: 400 }
      );
    }

    // Nạp Flight doc thật cho từng chặng — mọi đối chiếu seat_class/giá/ghế đang held đều dựa trên dữ liệu này.
    const flightDocs = await Promise.all(
      flights.map((f) => Flight.findById(f.flight_id))
    );
    const missingIndex = flightDocs.findIndex((f) => !f);
    if (missingIndex !== -1) {
      return NextResponse.json(
        { message: `Không tìm thấy chuyến bay flights[${missingIndex}].flight_id.` },
        { status: 404 }
      );
    }

    const legs = flights.map((f, i) => ({
      flightDoc: flightDocs[i],
      leg: f.leg,
    }));

    // Ném ValidationError (giấy tờ/tuổi, transit time, seat_class giả mạo, ghế chưa được chính user này giữ...).
    const { amounts } = await validateBookingCreation({
      passengers,
      legs,
      userId: user._id,
      pricing: await getAncillaryPricing(), // bảng giá dịch vụ bổ sung admin đang áp dụng
    });

    // Chống spam booking `pending_payment` (đốt lượt mã khuyến mãi, treo ghế).
    const nowTs = new Date();
    const livePending = { user_id: user._id, status: "pending_payment", "payment.payment_expires_at": { $gt: nowTs } };
    const seatKeys = passengers.flatMap((p) =>
      (p.seats ?? []).map((s) => ({ flight_id: s.flight_id, seat_number: s.seat_number }))
    );
    const dupBooking = await Booking.findOne(
      { ...livePending, passengers: { $elemMatch: { seats: { $elemMatch: { $or: seatKeys } } } } },
      "_id"
    );
    if (dupBooking) {
      return NextResponse.json(
        {
          message:
            "Bạn đã có một booking đang chờ thanh toán chứa các ghế này. Hãy thanh toán hoặc hủy booking đó trước.",
          existing_booking_id: String(dupBooking._id),
        },
        { status: 409 }
      );
    }
    if ((await Booking.countDocuments(livePending)) >= MAX_PENDING_BOOKINGS_PER_USER) {
      return NextResponse.json(
        { message: `Bạn có quá nhiều booking đang chờ thanh toán (tối đa ${MAX_PENDING_BOOKINGS_PER_USER}). Hãy thanh toán hoặc hủy bớt.` },
        { status: 429 }
      );
    }

    // Một hành khách (một số giấy tờ) chỉ có một chỗ trên mỗi chuyến bay, kể cả khi nằm ở đơn đặt vé khác.
    const documentIds = passengers.map((p) => p.document_id).filter(Boolean);
    if (documentIds.length > 0) {
      const flightIds = legs.map((l) => l.flightDoc._id);
      const clash = await Booking.findOne(
        {
          $or: [{ status: "confirmed" }, { status: "pending_payment", "payment.payment_expires_at": { $gt: nowTs } }],
          passengers: { $elemMatch: { document_id: { $in: documentIds }, "seats.flight_id": { $in: flightIds } } },
        },
        "passengers.document_id passengers.seats.flight_id"
      ).lean();
      if (clash) {
        const taken = clash.passengers.find(
          (p) => documentIds.includes(p.document_id) && p.seats.some((s) => flightIds.some((id) => String(id) === String(s.flight_id)))
        );
        return NextResponse.json(
          {
            message: `Số giấy tờ "${taken?.document_id ?? documentIds[0]}" đã có trong một đơn đặt vé khác trên cùng chuyến bay — mỗi hành khách chỉ được đặt một chỗ trên một chuyến.`,
          },
          { status: 409 }
        );
      }
    }

    // passengers[].seats[] đã được validateBookingCreation ghi baggage_kg/meal/addons_amount (giá server).
    const addonsByFlight = {};
    for (const p of passengers) {
      for (const s of p.seats) {
        addonsByFlight[String(s.flight_id)] = (addonsByFlight[String(s.flight_id)] || 0) + (s.addons_amount || 0);
      }
    }
    const flightLegs = legs.map((l) => ({
      flight_id: l.flightDoc._id,
      leg: l.leg,
      amount: amounts[String(l.flightDoc._id)],
      addons_amount: addonsByFlight[String(l.flightDoc._id)] || 0,
    }));
    const totalAmountBeforeDiscount = flightLegs.reduce((sum, l) => sum + l.amount, 0);

    // A5 — mã khuyến mãi (tùy chọn, chỉ áp khi client có gửi promotion_code).
    let promotion = null;
    let total_amount = totalAmountBeforeDiscount;

    // Mã khuyến mãi bị tăng used_count trước khi tạo booking (atomic, ghi chú p).
    const rollbackPromotion = async () => {
      if (promotion) {
        await Promotion.updateOne({ _id: promotion._id, used_count: { $gt: 0 } }, { $inc: { used_count: -1 } });
      }
    };
    if (promotion_code !== undefined && promotion_code !== null && promotion_code !== "") {
      if (typeof promotion_code !== "string") {
        return NextResponse.json({ message: "promotion_code không hợp lệ." }, { status: 400 });
      }
      promotion = await applyPromotion(promotion_code);
      // Chỉ giảm trên giá vé (không giảm hành lý/suất ăn).
      applyDiscountToLegs(flightLegs, promotion);
      total_amount = flightLegs.reduce((sum, l) => sum + l.amount, 0);
    }

    // VNPay chỉ nhận 5.000đ – dưới 1 tỷ đồng/giao dịch: báo lỗi ngay.
    if (total_amount < PAYMENT_MIN_AMOUNT || total_amount > PAYMENT_MAX_AMOUNT) {
      await rollbackPromotion();
      return NextResponse.json(
        {
          message: `Tổng tiền ${total_amount.toLocaleString("vi-VN")}đ nằm ngoài giới hạn thanh toán VNPay (${PAYMENT_MIN_AMOUNT.toLocaleString("vi-VN")}–${PAYMENT_MAX_AMOUNT.toLocaleString("vi-VN")}đ).`,
        },
        { status: 400 }
      );
    }

    const heldUntil = earliestHeldUntil(flightDocs, passengers);
    const payment_expires_at = heldUntil
      ? new Date(heldUntil.getTime() - PAYMENT_EXPIRY_BUFFER_MS)
      : null;

    let booking;
    try {
      booking = await Booking.create({
        user_id: user._id,
        trip_type,
        locale: user.preferred_language,
        flights: flightLegs,
        passengers,
        contact,
        promotion_id: promotion ? promotion._id : null,
        total_amount,
        status: "pending_payment",
        payment: { payment_expires_at },
      });
    } catch (createErr) {
      await rollbackPromotion();
      throw createErr;
    }

    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    // ValidationError (bookingValidationService) đã có sẵn statusCode.
    return handleApiError(err, "POST /api/bookings");
  }
}
