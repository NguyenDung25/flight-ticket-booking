// app/api/bookings/route.js
//
// C6 — tạo Booking `pending_payment` SAU KHI khách đã hold-seat (C5) cho mọi
// ghế và nhập xong hành khách (C4). Route này KHÔNG tự hold ghế — chỉ tin
// những ghế đã `held` bởi ĐÚNG user hiện tại (xem
// bookingValidationService.assertSeatIsHeldByUser).
//
// KHÔNG tin bất kỳ giá trị nào ảnh hưởng tới tiền (seat_class, amount) hay
// giấy tờ (document_type/document_id theo tuổi) từ client — toàn bộ được
// đối chiếu lại ở services/bookingValidationService.js trước khi ghi DB.

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import Flight from "@/models/Flight";
import Booking from "@/models/Booking";
import { validateBookingCreation } from "@/services/bookingValidationService";
import { applyPromotion, computeDiscountAmount } from "@/services/promotionService";
import { PAYMENT_EXPIRY_BUFFER_MS } from "@/config/constants";

/**
 * payment.payment_expires_at (ghi chú y) = held_until CỦA GHẾ GIỮ SỚM NHẤT
 * trong toàn booking, trừ đi buffer — dùng mốc SỚM NHẤT (không phải trễ
 * nhất/trung bình) để an toàn: nếu khách giữ ghế A lúc 10:00 và ghế B lúc
 * 10:05 (nhập hành khách xong mới chọn ghế lần lượt), ghế A hết hạn TRƯỚC —
 * payment_expires_at phải bám theo mốc đó, không phải mốc của ghế B.
 */
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
    const user = await requireActiveUser(session);

    const body = await request.json().catch(() => ({}));
    const { trip_type, flights, passengers, promotion_code } = body ?? {};

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
    // BẮT BUỘC validate leg TRƯỚC khi gọi validateBookingCreation: nếu
    // round_trip mà thiếu đúng 1 'outbound' + 1 'return' (client lỗi hoặc cố
    // tình gửi sai), bookingValidationService.validateRoundTripTransit sẽ
    // .find() ra undefined rồi crash TypeError khi đọc undefined.flightDoc —
    // chặn ở đây để trả 400 rõ ràng thay vì lộ lỗi 500 chung chung.
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

    // flight_id sai định dạng ObjectId (không phải do không tồn tại — đó là
    // trường hợp 404 xử lý bên dưới) sẽ khiến Flight.findById ném Mongoose
    // CastError, KHÔNG có statusCode → handleApiError rơi vào nhánh 500 mù mờ.
    // Chặn sớm ở đây để trả đúng 400.
    const badIdIndex = flights.findIndex(
      (f) => !mongoose.isValidObjectId(f?.flight_id)
    );
    if (badIdIndex !== -1) {
      return NextResponse.json(
        { message: `flights[${badIdIndex}].flight_id không hợp lệ.` },
        { status: 400 }
      );
    }

    // Nạp Flight doc THẬT cho từng chặng — mọi đối chiếu seat_class/giá/ghế
    // đang held đều dựa trên dữ liệu này, KHÔNG dựa vào flights[] client gửi.
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

    // Ném ValidationError (giấy tờ/tuổi, transit time, seat_class giả mạo,
    // ghế chưa được chính user này giữ...) — bắt ở catch bên dưới.
    const { amounts } = await validateBookingCreation({
      passengers,
      legs,
      userId: user._id,
    });

    const flightLegs = legs.map((l) => ({
      flight_id: l.flightDoc._id,
      leg: l.leg,
      amount: amounts[String(l.flightDoc._id)],
    }));
    const totalAmountBeforeDiscount = flightLegs.reduce((sum, l) => sum + l.amount, 0);

    // A5 — mã khuyến mãi (tùy chọn, chỉ áp khi client có gửi promotion_code).
    // applyPromotion() ném PromotionError (404/400/409, xem
    // services/promotionService.js) nếu mã không hợp lệ — bắt ở catch bên
    // dưới như mọi lỗi nghiệp vụ khác, KHÔNG bọc try/catch riêng ở đây để
    // âm thầm bỏ qua mã sai (khách phải biết rõ mã bị từ chối, không được
    // lặng lẽ tính giá gốc).
    //
    // GỌI applyPromotion() SAU KHI validateBookingCreation() đã pass (ở
    // trên) — tăng used_count càng trễ càng tốt, giảm tối đa cửa sổ "đã tính
    // là dùng mã nhưng cuối cùng Booking.create() lại lỗi vì lý do khác".
    // Vẫn còn 1 khe hở nhỏ (nếu Booking.create() bên dưới lỗi, used_count
    // coi như mất 1 lượt oan) — chấp nhận được, ĐÚNG tinh thần đánh đổi đã
    // ghi rõ ở ghi chú (p): "khi booking dùng mã bị hủy → KHÔNG giảm lại
    // used_count", tức là dự án đã chấp nhận used_count có thể không khớp
    // tuyệt đối 100% với số booking thực tế dùng mã thành công, đổi lấy
    // KHÔNG cần transaction/lock phức tạp.
    let promotion = null;
    let total_amount = totalAmountBeforeDiscount;
    if (promotion_code) {
      promotion = await applyPromotion(promotion_code);
      const discountAmount = computeDiscountAmount(promotion, totalAmountBeforeDiscount);

      // Chia đều discountAmount xuống TỪNG CHẶNG theo đúng tỷ lệ amount của
      // chặng đó — BẮT BUỘC giữ bất biến "total_amount === Σ flights[].amount"
      // (ghi chú t) vì services/cancellationService.js (A7/C9/A8) dùng TRỰC
      // TIẾP flights[leg].amount cho TH2 (hoàn tiền riêng chặng về) và dùng
      // Σ flights[].amount đã bay để trừ khỏi total_amount ở A8 — nếu để
      // flights[].amount giữ nguyên giá GỐC (chưa giảm) trong khi
      // total_amount đã trừ giảm giá, 2 con số lệch nhau sẽ làm sai hoàn
      // toàn mọi phép tính hoàn tiền sau này, không phải lỗi ở
      // cancellationService — lỗi ở chỗ phá vỡ bất biến ngay từ đây.
      let allocated = 0;
      flightLegs.forEach((leg, i) => {
        if (i === flightLegs.length - 1) {
          // Chặng cuối nhận phần dư của phép chia làm tròn xuống (Math.floor
          // ở mỗi chặng trước có thể để dư 1-2đ) — đảm bảo tổng SAU khi trừ
          // đúng bằng totalAmountBeforeDiscount - discountAmount, không lệch
          // vài đồng do làm tròn từng chặng riêng lẻ.
          leg.amount -= discountAmount - allocated;
        } else {
          const legDiscount = Math.floor((leg.amount * discountAmount) / totalAmountBeforeDiscount);
          leg.amount -= legDiscount;
          allocated += legDiscount;
        }
      });
      total_amount = flightLegs.reduce((sum, l) => sum + l.amount, 0);
    }

    const heldUntil = earliestHeldUntil(flightDocs, passengers);
    const payment_expires_at = heldUntil
      ? new Date(heldUntil.getTime() - PAYMENT_EXPIRY_BUFFER_MS)
      : null;

    const booking = await Booking.create({
      user_id: user._id,
      trip_type,
      locale: user.preferred_language,
      flights: flightLegs,
      passengers,
      promotion_id: promotion ? promotion._id : null,
      total_amount,
      status: "pending_payment",
      payment: { payment_expires_at },
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    // ValidationError (bookingValidationService) đã có sẵn statusCode —
    // handleApiError tự nhận diện và trả đúng mã lỗi (xem lib/apiError.js),
    // không cần bắt riêng ở đây.
    return handleApiError(err, "POST /api/bookings");
  }
}
