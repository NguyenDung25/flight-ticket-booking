// tests/momoClient.test.js
//
// Kiểm thử chữ ký HMAC của Momo (lib/momoClient.js) — không gọi mạng. Biến môi trường
// phải đặt TRƯỚC khi require vì momoClient đọc chúng lúc nạp module.

process.env.MOMO_PARTNER_CODE = "TESTPARTNER";
process.env.MOMO_ACCESS_KEY = "test-access-key";
process.env.MOMO_SECRET_KEY = "test-secret-key";
process.env.MOMO_API_URL = "https://test-payment.momo.vn";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const momo = require("../lib/momoClient");

function signIpn(payload) {
  const raw =
    `accessKey=test-access-key&amount=${payload.amount}&extraData=${payload.extraData}` +
    `&message=${payload.message}&orderId=${payload.orderId}&orderInfo=${payload.orderInfo}` +
    `&orderType=${payload.orderType}&partnerCode=${payload.partnerCode}&payType=${payload.payType}` +
    `&requestId=${payload.requestId}&responseTime=${payload.responseTime}` +
    `&resultCode=${payload.resultCode}&transId=${payload.transId}`;
  return crypto.createHmac("sha256", "test-secret-key").update(raw).digest("hex");
}

const basePayload = {
  amount: 50000,
  extraData: "",
  message: "Successful.",
  orderId: "665f1c2e8b3a4d0012345678-1700000000000",
  orderInfo: "Thanh toan ve may bay",
  orderType: "momo_wallet",
  partnerCode: "TESTPARTNER",
  payType: "napas",
  requestId: "TESTPARTNER-1700000000000",
  responseTime: 1700000001000,
  resultCode: 0,
  transId: 4000000001,
};

test("verifyIpnSignature: chữ ký đúng được chấp nhận", () => {
  const payload = { ...basePayload };
  payload.signature = signIpn(payload);
  assert.equal(momo.verifyIpnSignature(payload), true);
});

test("verifyIpnSignature: sửa số tiền / resultCode thì bị từ chối", () => {
  const payload = { ...basePayload };
  payload.signature = signIpn(payload);
  assert.equal(momo.verifyIpnSignature({ ...payload, amount: 1 }), false);
  assert.equal(momo.verifyIpnSignature({ ...payload, resultCode: 1006 }), false);
});

test("verifyIpnSignature: thiếu / sai định dạng chữ ký không làm văng lỗi", () => {
  assert.equal(momo.verifyIpnSignature({ ...basePayload }), false);
  assert.equal(momo.verifyIpnSignature({ ...basePayload, signature: "zzzz" }), false);
  assert.equal(momo.verifyIpnSignature(null), false);
});

test("buildQueryRawSignature: đúng thứ tự field theo tài liệu Momo", () => {
  assert.equal(
    momo.buildQueryRawSignature({ orderId: "ORD1", requestId: "REQ1" }),
    "accessKey=test-access-key&orderId=ORD1&partnerCode=TESTPARTNER&requestId=REQ1"
  );
});

test("queryTransaction: gọi đúng endpoint /query, có chữ ký, trả nguyên resultCode", async () => {
  const realFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return { json: async () => ({ resultCode: 0, amount: 50000, transId: 4000000001 }) };
  };
  try {
    const result = await momo.queryTransaction({ orderId: "ORD1" });
    assert.equal(captured.url, "https://test-payment.momo.vn/v2/gateway/api/query");
    assert.equal(captured.body.orderId, "ORD1");
    assert.equal(captured.body.partnerCode, "TESTPARTNER");
    const expected = crypto
      .createHmac("sha256", "test-secret-key")
      .update(momo.buildQueryRawSignature({ orderId: "ORD1", requestId: captured.body.requestId }))
      .digest("hex");
    assert.equal(captured.body.signature, expected);
    assert.equal(result.resultCode, 0);
  } finally {
    global.fetch = realFetch;
  }
});

test("queryTransaction: lỗi mạng / phản hồi rác thì ném MomoClientError", async () => {
  const realFetch = global.fetch;
  try {
    global.fetch = async () => {
      throw new Error("ECONNRESET");
    };
    await assert.rejects(momo.queryTransaction({ orderId: "ORD1" }), momo.MomoClientError);

    global.fetch = async () => ({ json: async () => ({ foo: "bar" }) });
    await assert.rejects(momo.queryTransaction({ orderId: "ORD1" }), momo.MomoClientError);
  } finally {
    global.fetch = realFetch;
  }
});
