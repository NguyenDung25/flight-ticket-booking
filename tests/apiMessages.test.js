// tests/apiMessages.test.js — dịch thông báo lỗi API theo ngôn ngữ giao diện; lấy IP không tin
// X-Forwarded-For giả mạo.
const test = require("node:test");
const assert = require("node:assert/strict");
const { localizeApiMessage, EXACT } = require("../lib/apiMessages");
const { clientIp, ipForGateway, DIRECT } = require("../lib/clientIp");

test("localizeApiMessage: tiếng Việt giữ nguyên; tiếng Anh dịch đúng câu cố định", () => {
  const vi = "Chuyến bay đã bị hủy, không thể check-in.";
  assert.equal(localizeApiMessage(vi, "vi"), vi);
  assert.equal(localizeApiMessage(vi, "en"), "This flight has been cancelled; check-in is not available.");
  for (const [k, v] of Object.entries(EXACT)) {
    assert.equal(localizeApiMessage(k, "en"), v);
    assert.doesNotMatch(v, /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i, `còn tiếng Việt: ${v}`);
  }
});

test("localizeApiMessage: câu có biến (ghế, tên, số lượng, mã) dịch theo mẫu, giữ nguyên giá trị", () => {
  assert.equal(
    localizeApiMessage("Ghế 5C không còn trống — vui lòng chọn ghế khác.", "en"),
    "Seat 5C is no longer available — please choose another seat."
  );
  assert.equal(
    localizeApiMessage('Hành khách "Võ Thị Lan" chưa chọn ghế cho chuyến bay TS101039.', "en"),
    'Passenger "Võ Thị Lan" has not chosen a seat on flight TS101039.'
  );
  assert.equal(
    localizeApiMessage('Mã khuyến mãi "SALE10" đã hết lượt sử dụng.', "en"),
    'Promo code "SALE10" has no uses left.'
  );
  assert.equal(
    localizeApiMessage("Bạn nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.", "en"),
    "Too many incorrect attempts. Please try again in 15 minutes."
  );
  assert.equal(
    localizeApiMessage("Tổng tiền 0đ nằm ngoài giới hạn thanh toán VNPay (5.000–999.999.999đ).", "en"),
    "The total of 0 VND is outside the VNPay payment limit (5.000–999.999.999 VND)."
  );
});

test("localizeApiMessage: câu chưa có bản dịch / giá trị lạ → trả nguyên", () => {
  assert.equal(localizeApiMessage("Một lỗi mới chưa dịch.", "en"), "Một lỗi mới chưa dịch.");
  assert.equal(localizeApiMessage(undefined, "en"), undefined);
});

test("clientIp: mặc định KHÔNG tin X-Forwarded-For (chống giả mạo để né khóa chống dò)", () => {
  const h = new Headers({ "x-forwarded-for": "1.2.3.4" });
  assert.equal(clientIp(h, { trustProxy: false }), DIRECT);
  assert.equal(ipForGateway(h), "127.0.0.1"); // TRUST_PROXY không đặt trong môi trường test
});

test("clientIp: tin proxy thì lấy địa chỉ CUỐI (do proxy nối vào), không lấy địa chỉ người gọi tự khai", () => {
  const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
  assert.equal(clientIp(h, { trustProxy: true }), "203.0.113.9");
  assert.equal(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }), { trustProxy: true }), "198.51.100.7");
  assert.equal(clientIp(new Headers(), { trustProxy: true }), DIRECT);
});
