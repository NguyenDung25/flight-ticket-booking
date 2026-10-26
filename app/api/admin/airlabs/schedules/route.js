import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import dbConnect from "@/lib/mongodb";
import Airport from "@/models/Airport";
import { normalizeSchedules, getCachedSchedules, setCachedSchedules } from "@/lib/airlabsSchedules";

const AIRLABS_SCHEDULES_URL = "https://airlabs.co/api/v9/schedules";
const IATA = /^[A-Z]{3}$/;
// Gói free trả tối đa 100 dòng/lần (has_more + offset). Tra theo 1 sân bay thì lật trang, giới hạn để giữ hạn mức tháng.
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

async function fetchPage(params, apiKey, offset) {
  const url = `${AIRLABS_SCHEDULES_URL}?${params}&offset=${offset}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  return res.json();
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
    // Có thể bỏ trống 1 đầu: chỉ điểm đi -> mọi chuyến từ sân đó; chỉ điểm đến -> mọi chuyến tới sân đó.
    if ((dep && !IATA.test(dep)) || (arr && !IATA.test(arr)) || (!dep && !arr) || dep === arr) {
      return NextResponse.json(
        { message: "Cần chọn điểm đi hoặc điểm đến hợp lệ (mã IATA 3 ký tự, khác nhau)." },
        { status: 400 }
      );
    }

    // Cùng tuyến đã tra trong vài giờ gần đây -> trả kết quả đã lưu, không tốn lượt gọi AirLabs.
    const cached = getCachedSchedules(dep, arr);
    if (cached) {
      return NextResponse.json({ schedules: cached, cached: true });
    }

    const params = [dep && `dep_iata=${dep}`, arr && `arr_iata=${arr}`].filter(Boolean).join("&");
    const oneSided = !dep || !arr;
    const rows = [];
    let payload;
    let partial = false;
    try {
      for (let page = 0; page < (oneSided ? MAX_PAGES : 1); page++) {
        payload = await fetchPage(params, apiKey, page * PAGE_SIZE);
        if (payload?.error) break;
        rows.push(...(payload?.response ?? []));
        if (!payload?.request?.has_more) break;
        if (page === MAX_PAGES - 1) partial = true;
      }
    } catch {
      return NextResponse.json(
        { message: "Không kết nối được AirLabs (hết thời gian chờ hoặc lỗi mạng). Bạn có thể nhập tay." },
        { status: 502 }
      );
    }

    if (payload?.error && rows.length === 0) {
      // Không trả nguyên message của AirLabs (có thể chứa thông tin key/quota).
      console.error("[AirLabs schedules]", payload.error);
      return NextResponse.json(
        { message: "AirLabs từ chối yêu cầu (có thể hết hạn mức hoặc key không hợp lệ). Bạn có thể nhập tay." },
        { status: 502 }
      );
    }

    // Bỏ chuyến codeshare, bỏ trùng, sắp theo giờ VN, không cắt bớt (lib/airlabsSchedules.js).
    let airports = null;
    if (oneSided) {
      await dbConnect();
      airports = new Set((await Airport.find({}, "code").lean()).map((a) => a.code));
    }
    const schedules = normalizeSchedules(rows, airports);
    // Không lưu kết quả rỗng: AirLabs chỉ trả các chuyến còn lại trong ngày, tra lúc tối muộn có thể ra 0 chuyến.
    if (schedules.length > 0) setCachedSchedules(dep, arr, schedules);

    return NextResponse.json({ schedules, cached: false, partial });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/airlabs/schedules");
  }
}
