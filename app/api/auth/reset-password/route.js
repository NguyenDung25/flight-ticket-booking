// app/api/auth/reset-password/route.js
//
// Đặt lại mật khẩu từ link email: POST { token, new_password }. Token dùng 1 lần, hết hạn sau 30 phút;
// thành công thì mọi phiên đăng nhập cũ hết hiệu lực (services/accountService.resetPassword()).
// Giới hạn số lần thử sai theo IP để không dò được token.

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { handleApiError } from "@/lib/apiError";
import { clientIp } from "@/lib/clientIp";
import { lockRemainingMs, recordFailure, reset } from "@/lib/loginThrottle";
import { resetPassword } from "@/services/accountService";

export async function POST(request) {
  const key = `reset-ip:${clientIp(request.headers)}`;
  try {
    if (lockRemainingMs(key) > 0) {
      return NextResponse.json(
        { message: "Bạn thử quá nhiều lần. Vui lòng thử lại sau ít phút." },
        { status: 429 }
      );
    }
    await dbConnect();
    const body = (await request.json().catch(() => null)) ?? {};
    await resetPassword({ token: body.token, newPassword: body.new_password });
    reset(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err?.statusCode === 400) recordFailure(key);
    return handleApiError(err, "POST /api/auth/reset-password");
  }
}
