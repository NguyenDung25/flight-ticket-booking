// app/api/users/me/route.js
//
// C11 — cập nhật `preferred_language` khi khách đổi ngôn ngữ (đã đăng nhập).
// Chỉ cho sửa đúng 1 field này — không phải endpoint chỉnh sửa profile chung,
// không nhận `full_name`/`email`/`password`/`role` hay bất cứ field nào khác
// (đúng phạm vi C11 trong tài liệu chức năng).
//
// requireActiveUser() (ghi chú q): kiểm tra is_blocked trực tiếp từ DB tại
// thời điểm request, không chỉ dựa vào session — đúng convention các route
// nhạy cảm khác (hold-seat, POST /api/bookings...). Đổi ngôn ngữ ít nhạy cảm
// hơn đặt vé nhưng dùng chung hàm cho nhất quán, không viết logic riêng.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import User from "@/models/User";

const ALLOWED_LOCALES = ["vi", "en"];

export async function PATCH(request) {
  try {
    await dbConnect();
    const user = await requireActiveUser();

    const body = (await request.json().catch(() => null)) ?? {};
    const { preferred_language } = body;

    if (!preferred_language || !ALLOWED_LOCALES.includes(preferred_language)) {
      return NextResponse.json(
        { message: `preferred_language phải là một trong: ${ALLOWED_LOCALES.join(", ")}.` },
        { status: 400 }
      );
    }

    // findByIdAndUpdate + {returnDocument: "after"} thay vì find + save để tránh kích hoạt
    // các pre-validate không liên quan trên User schema (VD password_hash
    // required — không có vấn đề gì nhưng không cần gánh chi phí validate
    // toàn document chỉ để đổi 1 field enum đơn giản).
    const updated = await User.findByIdAndUpdate(
      user._id,
      { preferred_language },
      { returnDocument: "after", select: "preferred_language" }
    );

    return NextResponse.json({ preferred_language: updated.preferred_language });
  } catch (err) {
    return handleApiError(err, "PATCH /api/users/me");
  }
}
