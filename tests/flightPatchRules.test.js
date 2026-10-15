// tests/flightPatchRules.test.js — luật PATCH chuyến bay (L2/L3), không cần MongoDB.
const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePatch, changedSensitiveFields } = require("../lib/flightPatchRules");

const cur = {
  departure_time: new Date("2026-11-10T01:00:00Z"),
  arrival_time: new Date("2026-11-10T03:00:00Z"),
  origin_code: "HAN",
  dest_code: "SGN",
  base_price: { economy: 1000000, business: 2500000 },
  hasBusinessSeats: true,
};

test("tài liệu (v/A8): PATCH status cancelled là sửa trạng thái đơn thuần — không bị từ chối ở tầng luật", () => {
  assert.doesNotThrow(() => validatePatch({ status: "cancelled" }, cur));
});
test("cho phép status scheduled", () => {
  assert.doesNotThrow(() => validatePatch({ status: "scheduled" }, cur));
});
test("L2: giờ đến trước giờ đi bị từ chối (chỉ đổi 1 phía vẫn kiểm tra với giá trị cũ)", () => {
  assert.throws(() => validatePatch({ arrival_time: "2026-11-10T00:00:00Z" }, cur), /Giờ đến/);
  assert.throws(() => validatePatch({ departure_time: "2026-11-10T05:00:00Z" }, cur), /Giờ đến/);
});
test("L2: origin trùng dest bị từ chối", () => {
  assert.throws(() => validatePatch({ dest_code: "HAN" }, cur), /không được trùng/);
});
test("L2: có ghế business thì bắt buộc giá business", () => {
  assert.throws(() => validatePatch({ base_price: { economy: 900000 } }, cur), /business/);
  assert.doesNotThrow(() => validatePatch({ base_price: { economy: 900000 } }, { ...cur, hasBusinessSeats: false }));
});
test("ngày sai định dạng bị từ chối 400", () => {
  assert.throws(() => validatePatch({ departure_time: "abc" }, cur), { statusCode: 400 });
});
test("gửi lại đúng giá trị cũ KHÔNG tính là thay đổi nhạy cảm", () => {
  const same = {
    flight_number: "VN123",
    origin_code: "HAN",
    dest_code: "SGN",
    departure_time: "2026-11-10T01:00:00.000Z",
    arrival_time: "2026-11-10T03:00:00.000Z",
    base_price: { economy: 1000000, business: 2500000 },
  };
  assert.deepEqual(changedSensitiveFields(same, cur), []);
});
test("đổi giá trị thật thì bị tính là nhạy cảm", () => {
  assert.deepEqual(changedSensitiveFields({ arrival_time: "2026-11-10T04:00:00Z" }, cur), ["arrival_time"]);
  // đổi bảng giá không làm sai lệch vé đã bán (amount đã chốt trong Booking) → không bị coi là nhạy cảm
  assert.deepEqual(changedSensitiveFields({ base_price: { economy: 1, business: 2500000 } }, cur), []);
  assert.deepEqual(changedSensitiveFields({ dest_code: "DAD" }, cur), ["dest_code"]);
});
