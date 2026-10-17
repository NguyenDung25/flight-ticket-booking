import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { handleApiError } from "@/lib/apiError";
import { clientIp } from "@/lib/clientIp";
import { lockRemainingMs, recordFailure } from "@/lib/loginThrottle";
import { sendPasswordResetEmail } from "@/lib/emailClient";
import { requestPasswordReset, PASSWORD_RESET_TTL_MINUTES } from "@/services/accountService";

const GENERIC_MESSAGE =
  "Nếu email này đã đăng ký tài khoản, chúng tôi đã gửi link đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (cả mục Spam).";

export async function POST(request) {
  try {
    const key = `forgot-ip:${clientIp(request.headers)}`;
    if (lockRemainingMs(key) > 0) {
      return NextResponse.json(
        { message: "Bạn gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút." },
        { status: 429 }
      );
    }
    recordFailure(key); // đếm mọi yêu cầu (không chỉ yêu cầu sai) — tối đa 5 lần / 15 phút / IP

    await dbConnect();
    const body = (await request.json().catch(() => null)) ?? {};
    const result = await requestPasswordReset({ email: body.email });

    if (result) {
      const locale = result.user.preferred_language === "en" ? "en" : "vi";
      const base = (process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin).replace(/\/+$/, "");
      const link = `${base}/${locale}/reset-password?token=${result.token}`;
      await sendPasswordResetEmail({
        to: result.user.email,
        name: result.user.full_name,
        link,
        locale,
        minutes: PASSWORD_RESET_TTL_MINUTES,
      });
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (err) {
    return handleApiError(err, "POST /api/auth/forgot-password");
  }
}
