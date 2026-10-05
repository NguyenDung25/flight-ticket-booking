// app/api/admin/airlabs/schedules/route.js
//
// A1 — hỗ trợ "tự điền từ AirLabs" khi admin tạo chuyến bay (FlightForm.jsx):
// tra lịch bay có sẵn của 1 tuyến (dep_iata -> arr_iata) để lấy mã chuyến bay,
// hãng, giờ bay/đến thay vì gõ tay.
//
// Gọi AirLabs Ở SERVER (không gọi thẳng từ trình duyệt) — AIRLABS_API_KEY là
// bí mật, đặt trong .env.local và KHÔNG được lộ ra bundle client (F12). Chỉ
// admin gọi được (requireAdminUser) để không ai lạm dụng hạn mức API.
//
// AirLabs /schedules trả lịch lặp hằng ngày (giờ theo UTC ở dep_time_utc/
// arr_time_utc). Route đổi sang giờ VN (dep_vn/arr_vn dạng "YYYY-MM-DDTHH:mm",
// đúng định dạng input datetime-local) — form chỉ cần điền thẳng, admin vẫn
// tự chọn ngày bay. Kết quả tự điền chỉ là GỢI Ý, admin có thể sửa lại trước
// khi lưu (mọi validate thật vẫn ở POST /api/admin/flights).

import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { toVN } from "@/lib/timezone";

const AIRLABS_SCHEDULES_URL = "https://airlabs.co/api/v9/schedules";
const IATA = /^[A-Z]{3}$/;
const MAX_RESULTS = 30;

function toVNInput(utcString) {
  // AirLabs: "YYYY-MM-DD HH:mm" (UTC). Ghép "Z" để parse đúng là UTC.
  const d = new Date(`${utcString.replace(" ", "T")}:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return toVN(d).format("YYYY-MM-DDTHH:mm");
}

export async function GET(request) {
  try {
    await requireAdminUser();

    const apiKey = process.env.AIRLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { message: "Chưa cấu hình AIRLABS_API_KEY trong .env.local." },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dep = (searchParams.get("dep") || "").toUpperCase();
    const arr = (searchParams.get("arr") || "").toUpperCase();
    if (!IATA.test(dep) || !IATA.test(arr) || dep === arr) {
      return NextResponse.json(
        { message: "Cần chọn điểm đi và điểm đến hợp lệ (mã IATA 3 ký tự, khác nhau)." },
        { status: 400 }
      );
    }

    const url = `${AIRLABS_SCHEDULES_URL}?dep_iata=${dep}&arr_iata=${arr}&api_key=${encodeURIComponent(apiKey)}`;
    let payload;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      payload = await res.json();
    } catch {
      return NextResponse.json(
        { message: "Không kết nối được AirLabs (hết thời gian chờ hoặc lỗi mạng). Bạn có thể nhập tay." },
        { status: 502 }
      );
    }

    if (payload?.error) {
      // Không trả nguyên message của AirLabs (có thể chứa thông tin key/quota).
      console.error("[AirLabs schedules]", payload.error);
      return NextResponse.json(
        { message: "AirLabs từ chối yêu cầu (có thể hết hạn mức hoặc key không hợp lệ). Bạn có thể nhập tay." },
        { status: 502 }
      );
    }

    const seen = new Set();
    const schedules = [];
    for (const s of payload?.response ?? []) {
      if (!s.flight_iata || !s.dep_time_utc || !s.arr_time_utc) continue;
      const depVN = toVNInput(s.dep_time_utc);
      const arrVN = toVNInput(s.arr_time_utc);
      if (!depVN || !arrVN) continue;
      const key = `${s.flight_iata}|${depVN.slice(11)}`;
      if (seen.has(key)) continue; // AirLabs lặp cùng chuyến nhiều ngày
      seen.add(key);
      schedules.push({
        flight_iata: s.flight_iata,
        airline_iata: s.airline_iata ?? null,
        dep_vn: depVN,
        arr_vn: arrVN,
      });
    }
    schedules.sort((a, b) => a.dep_vn.slice(11).localeCompare(b.dep_vn.slice(11)));

    return NextResponse.json({ schedules: schedules.slice(0, MAX_RESULTS) });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/airlabs/schedules");
  }
}
