// lib/checkinGuard.js
//
// C10 — check-in online không cần đăng nhập (giống website hãng bay), nên phải chặn dò mã đặt chỗ +
// họ hành khách bằng cách thử liên tục: dùng lại bộ đếm của lib/loginThrottle.js (MAX_FAILURES lần
// sai thì khóa LOCK_MS) trên 2 khóa cùng lúc:
//   - theo IP người gọi (lib/clientIp.js — KHÔNG tin X-Forwarded-For trừ khi TRUST_PROXY=true), và
//   - theo mã đặt chỗ đang bị thử (chặn đoán họ cho 1 mã cụ thể, kể cả khi đổi IP liên tục).

import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { lockRemainingMs, recordFailure, reset } from "@/lib/loginThrottle";
import { clientIp } from "@/lib/clientIp";
import { normalizeBookingCode } from "@/lib/bookingCode";

/**
 * Đọc body JSON rồi chạy `fn(body)` trong vòng bảo vệ chống dò: IP hoặc mã đang bị khóa -> 429; `fn`
 * ném lỗi 400/404 (sai mã/họ) -> tính 1 lần sai cho cả 2 khóa; thành công -> xóa bộ đếm. Lỗi khác
 * (409 ngoài khung giờ, 422 chưa đồng ý ICI...) không tính là dò.
 */
export async function withCheckinGuard(request, context, fn) {
  const body = await request.json().catch(() => ({}));
  const code = normalizeBookingCode(body?.booking_code);
  const keys = [`checkin-ip:${clientIp(request.headers)}`];
  if (code) keys.push(`checkin-code:${code}`);

  const wait = Math.max(...keys.map((k) => lockRemainingMs(k)));
  if (wait > 0) {
    return NextResponse.json(
      { message: `Bạn nhập sai quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(wait / 60000)} phút.` },
      { status: 429 }
    );
  }
  try {
    const result = await fn(body ?? {});
    keys.forEach((k) => reset(k));
    return NextResponse.json(result);
  } catch (err) {
    if (err && (err.statusCode === 400 || err.statusCode === 404)) keys.forEach((k) => recordFailure(k));
    return handleApiError(err, context);
  }
}
