// Field mà đổi giá trị sẽ làm sai lệch vé đã bán nên bị chặn khi chuyến đã có booking hiệu lực.
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

/** Trả về danh sách field nhạy cảm có giá trị thực sự đổi so với bản ghi hiện có. */
function changedSensitiveFields(updates, current) {
  return SENSITIVE_FIELDS.filter(
    (f) => updates[f] !== undefined && !sameValue(f, updates[f], current[f])
  );
}

function validatePatch(updates, current) {
  // Ghi chú: status "cancelled" qua PATCH là sửa trạng thái đơn thuần (ghi chú v/A8).

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
