// app/api/auth/register/route.js
//
// C8 — đăng ký tài khoản. Chỉ TẠO user, KHÔNG tự đăng nhập luôn (client tự
// gọi `signIn("credentials", {...})` sau khi đăng ký thành công ở trang
// /register — giữ 2 việc tách bạch, dễ debug khi có lỗi).

import { NextResponse } from "next/server";
import { registerUser, AuthError } from "@/services/authService";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Body request phải là JSON hợp lệ." },
      { status: 400 }
    );
  }

  const { email, password, full_name, preferred_language } = body ?? {};

  try {
    const user = await registerUser({
      email,
      password,
      full_name,
      preferred_language,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ message: err.message }, { status: err.statusCode });
    }
    // Lỗi không lường trước (VD mất kết nối DB) — không lộ chi tiết ra client.
    console.error("[POST /api/auth/register]", err);
    return NextResponse.json(
      { message: "Đã có lỗi xảy ra, vui lòng thử lại." },
      { status: 500 }
    );
  }
}
