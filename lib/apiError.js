import { NextResponse } from "next/server";

export function handleApiError(err, context = "") {
  // Lỗi nghiệp vụ có sẵn statusCode.
  if (err && typeof err.statusCode === "number") {
    return NextResponse.json({ message: err.message }, { status: err.statusCode });
  }

  // Lỗi trùng unique index của Mongoose (VD Airline.code, Booking.booking_code trùng).
  if (err && err.code === 11000) {
    return NextResponse.json(
      { message: "Dữ liệu bị trùng (vi phạm ràng buộc duy nhất, VD mã đã tồn tại)." },
      { status: 409 }
    );
  }

  // Lỗi validate của chính Mongoose (VD thiếu field required, sai enum).
  if (err && err.name === "CastError") {
    return NextResponse.json({ message: "Tham số không hợp lệ (sai định dạng id)." }, { status: 400 });
  }

  if (err && err.name === "ValidationError") {
    return NextResponse.json({ message: err.message }, { status: 400 });
  }

  // Lỗi hệ thống bất ngờ — log đầy đủ ở server, không lộ chi tiết ra client.
  console.error(`[API ERROR]${context ? " " + context : ""}`, err);
  return NextResponse.json(
    { message: "Đã có lỗi xảy ra, vui lòng thử lại sau." },
    { status: 500 }
  );
}
