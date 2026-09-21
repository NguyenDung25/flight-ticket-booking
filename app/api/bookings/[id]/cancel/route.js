// app/api/bookings/[id]/cancel/route.js
//
// C9 — khách tự hủy vé của CHÍNH MÌNH. Method PATCH (đúng theo
// chuc-nang-he-thong.md: "PATCH /api/bookings/[id]/cancel", dùng chung với
// A3) — KHÔNG phải POST, vì đây là sửa trạng thái 1 resource đã tồn tại chứ
// không phải tạo mới.
//
// C9 — khách tự hủy vé của CHÍNH MÌNH. Dùng CHUNG services/cancellationService.cancelBooking
// với A3 (admin hủy thay mặt khách) — hàm đó không tự biết "ai đang gọi",
// nên route này PHẢI tự đối chiếu booking.user_id === user hiện tại TRƯỚC
// khi gọi service, nếu không bất kỳ khách nào cũng hủy được vé của người khác.
//
// cancelBooking() tự xử lý mọi rule nghiệp vụ (mốc phí 24h/3h, 3 trường hợp
// khứ hồi ghi chú w, chặn hủy nếu đã check-in ghi chú l) — route này KHÔNG
// lặp lại logic đó, chỉ lo auth + ownership + map lỗi.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { auth } from "@/auth";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
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
    if (String(existing.user_id) !== String(user._id)) {
      return NextResponse.json(
        { message: "Bạn không có quyền hủy booking này." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const cancelReason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : DEFAULT_CANCEL_REASON;

    const booking = await cancelBooking({ bookingId: id, cancelReason });

    return NextResponse.json(booking);
  } catch (err) {
    return handleApiError(err, "POST /api/bookings/[id]/cancel");
  }
}
