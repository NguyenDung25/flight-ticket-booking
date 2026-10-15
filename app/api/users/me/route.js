// app/api/users/me/route.js
//
// Hồ sơ tài khoản đang đăng nhập:
// - GET   -> email, họ tên, ngôn ngữ, ngày tạo (trang Tài khoản).
// - PATCH -> { preferred_language } khi đổi ngôn ngữ (C11) và/hoặc { full_name } ở trang Tài khoản.
//   KHÔNG nhận email/password/role hay field nào khác — đổi mật khẩu đi riêng qua
//   POST /api/users/me/password (phải xác nhận mật khẩu hiện tại).
//
// requireActiveUser() (ghi chú q): kiểm tra is_blocked trực tiếp từ DB tại thời điểm request.

import { NextResponse } from "next/server";
import { auth, unstable_update } from "@/auth";
import dbConnect from "@/lib/mongodb";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import User from "@/models/User";
import { updateProfile } from "@/services/accountService";

const ALLOWED_LOCALES = ["vi", "en"];

export async function GET() {
  try {
    await dbConnect();
    const user = await requireActiveUser(await auth());
    return NextResponse.json({
      email: user.email,
      full_name: user.full_name,
      preferred_language: user.preferred_language,
      created_at: user.created_at,
    });
  } catch (err) {
    return handleApiError(err, "GET /api/users/me");
  }
}

export async function PATCH(request) {
  try {
    await dbConnect();
    const session = await auth();
    const user = await requireActiveUser(session);

    const body = (await request.json().catch(() => null)) ?? {};
    const { preferred_language, full_name } = body;
    if (preferred_language === undefined && full_name === undefined) {
      return NextResponse.json({ message: "Không có thông tin nào để cập nhật." }, { status: 400 });
    }

    const result = {};
    if (preferred_language !== undefined) {
      if (!ALLOWED_LOCALES.includes(preferred_language)) {
        return NextResponse.json(
          { message: `preferred_language phải là một trong: ${ALLOWED_LOCALES.join(", ")}.` },
          { status: 400 }
        );
      }
      // findByIdAndUpdate thay vì find + save: không chạy validate toàn document chỉ để đổi 1 field.
      const updated = await User.findByIdAndUpdate(
        user._id,
        { preferred_language },
        { returnDocument: "after", select: "preferred_language" }
      );
      result.preferred_language = updated.preferred_language;
    }

    if (full_name !== undefined) {
      const { full_name: name } = await updateProfile({ user, fullName: full_name });
      result.full_name = name;
      // Cập nhật tên trong phiên đăng nhập (JWT) để header hiện tên mới ngay, không phải đăng nhập lại.
      await unstable_update({ user: { name } }).catch((err) =>
        console.error("Không cập nhật được tên trong phiên đăng nhập:", err.message)
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "PATCH /api/users/me");
  }
}
