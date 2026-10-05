// app/api/bookings/[id]/cancel/route.js
//
// C9 — khách tự hủy vé của CHÍNH MÌNH / A3 — admin hủy THAY MẶT khách. Method
// PATCH (đúng theo chuc-nang-he-thong.md: "PATCH /api/bookings/[id]/cancel",
// dùng chung với A3) — KHÔNG phải POST, vì đây là sửa trạng thái 1 resource
// đã tồn tại chứ không phải tạo mới.
//
// Dùng CHUNG services/cancellationService.cancelBooking với A3 — hàm đó
// không tự biết "ai đang gọi", nên route này PHẢI tự đối chiếu quyền:
// - Chủ booking (user_id trùng) -> luôn được hủy (C9).
// - KHÁC user_id NHƯNG role === "admin" -> vẫn được hủy (A3), BẮT BUỘC phải
//   tự cung cấp `reason` rõ ràng (KHÔNG cho phép rơi về DEFAULT_CANCEL_REASON
//   "Khách tự hủy vé." — sẽ SAI SỰ THẬT nếu admin mới là người bấm hủy, ảnh
//   hưởng tới audit trail/A7 nhật ký hoàn tiền sau này).
// - Còn lại (khác user_id, không phải admin) -> 403.
//
// cancelBooking() tự xử lý mọi rule nghiệp vụ (mốc phí 24h/3h, 3 trường hợp
// khứ hồi ghi chú w, chặn hủy nếu đã check-in ghi chú l) — route này KHÔNG
// lặp lại logic đó, chỉ lo auth + phân quyền + map lỗi.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { ActiveUserError } from "@/lib/requireActiveUser";
import Booking from "@/models/Booking";
import { cancelBooking } from "@/services/cancellationService";

const DEFAULT_CANCEL_REASON = "Khách tự hủy vé.";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();

    const session = await auth();
    const user = await requireActiveUser(session);

    const { id } = await params;
    const existing = await Booking.findById(id);
    if (!existing) {
      return NextResponse.json({ message: "Không tìm thấy booking." }, { status: 404 });
    }

    const isOwner = String(existing.user_id) === String(user._id);
    const isAdmin = user.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { message: "Bạn không có quyền hủy booking này." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawReason = typeof body?.reason === "string" ? body.reason.trim() : "";

    let cancelReason;
    if (isOwner) {
      cancelReason = rawReason || DEFAULT_CANCEL_REASON;
    } else {
      // A3 — admin hủy thay mặt khách khác: KHÔNG có default, bắt buộc nêu lý do.
      if (!rawReason) {
        throw new ActiveUserError("Cần nêu rõ lý do khi hủy vé thay mặt khách (A3).", 400);
      }
      cancelReason = `[Admin hủy thay] ${rawReason}`;
    }

    const booking = await cancelBooking({ bookingId: id, cancelReason });

    return NextResponse.json(booking);
  } catch (err) {
    return handleApiError(err, "PATCH /api/bookings/[id]/cancel");
  }
}
