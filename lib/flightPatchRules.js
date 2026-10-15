// lib/flightPatchRules.js
//
// Luật kiểm tra cho PATCH /api/admin/flights/[id]. Tách khỏi route để test được
// không cần MongoDB. findByIdAndUpdate KHÔNG chạy pre("validate") của schema nên
// các kiểm tra chéo phải làm tay ở đây.

// Field mà đổi giá trị sẽ làm sai lệch VÉ ĐÃ BÁN nên bị chặn khi chuyến đã có booking hiệu lực.
// Tài liệu (A1, ghi chú v) nêu rõ departure_time; arrival_time/origin_code/dest_code là mở rộng cùng
// lý do (vé, transit khứ hồi đều dựa vào). base_price KHÔNG nằm trong danh sách: tiền mỗi vé đã chốt
// vào Booking.flights[].amount lúc đặt (ghi chú t) nên đổi bảng giá chỉ ảnh hưởng lượt đặt sau.
const SENSITIVE_FIELDS = ["departure_time", "arrival_time", "origin_code", "dest_code"];

class PatchRuleError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sameValue(field, a, b) {
  if (field === "departure_time" || field === "arrival_time") {
    return new Date(a).getTime() === new Date(b).getTime();
  }
  return a === b;
}

/**
 * Trả về danh sách field nhạy cảm có GIÁ TRỊ THỰC SỰ ĐỔI so với bản ghi hiện có.
 * Gửi lại đúng giá trị cũ (UI luôn gửi đủ form) không tính là thay đổi.
 */
function changedSensitiveFields(updates, current) {
  return SENSITIVE_FIELDS.filter(
    (f) => updates[f] !== undefined && !sameValue(f, updates[f], current[f])
  );
}

/**
 * @param {object} updates  field đã lọc từ body (origin/dest đã toUpperCase)
 * @param {object} current  { departure_time, arrival_time, origin_code, dest_code, base_price, hasBusinessSeats }
 * @throws {PatchRuleError} 400
 */
function validatePatch(updates, current) {
  // Ghi chú: status "cancelled" qua PATCH là sửa trạng thái đơn thuần (ghi chú v/A8) — KHÔNG cascade
  // sang booking; việc hủy vé + hoàn tiền là hành động riêng (POST .../cancel-bulk).

  for (const f of ["departure_time", "arrival_time"]) {
    if (updates[f] !== undefined && Number.isNaN(new Date(updates[f]).getTime())) {
      throw new PatchRuleError(`${f} không phải thời điểm hợp lệ.`);
    }
  }

  const dep = new Date(updates.departure_time ?? current.departure_time);
  const arr = new Date(updates.arrival_time ?? current.arrival_time);
  if (arr <= dep) throw new PatchRuleError("Giờ đến phải sau giờ khởi hành.");

  const origin = updates.origin_code ?? current.origin_code;
  const dest = updates.dest_code ?? current.dest_code;
  if (origin === dest) throw new PatchRuleError("Điểm đi và điểm đến không được trùng nhau.");

  const price = updates.base_price ?? current.base_price;
  if (current.hasBusinessSeats && (price?.business === undefined || price?.business === null)) {
    throw new PatchRuleError("Chuyến có ghế business — bắt buộc nhập giá business.");
  }
}

module.exports = { SENSITIVE_FIELDS, PatchRuleError, changedSensitiveFields, validatePatch };
