import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiError";
import { lockRemainingMs, recordFailure, reset } from "@/lib/loginThrottle";
import { clientIp } from "@/lib/clientIp";
import { normalizeBookingCode } from "@/lib/bookingCode";

/** Đọc body JSON rồi chạy `fn(body)` trong vòng bảo vệ chống dò: IP hoặc mã đang bị khóa -> 429. */
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
