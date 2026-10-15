// tests/vnpayClient.test.js
//
// Kiểm thử chữ ký HMAC-SHA512 của VNPay (lib/vnpayClient.js) — không gọi mạng thật. vnpayClient
// đọc biến môi trường lúc gọi, nên đặt ở đầu file là đủ.

process.env.VNPAY_TMN_CODE = "TESTTMN1";
process.env.VNPAY_HASH_SECRET = "TESTSECRETKEY0123456789ABCDEFGHI";
process.env.VNPAY_PAY_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
process.env.VNPAY_API_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const querystring = require("node:querystring");
const vnpay = require("../lib/vnpayClient");

const SECRET = process.env.VNPAY_HASH_SECRET;
const hmac = (data) => crypto.createHmac("sha512", SECRET).update(Buffer.from(data, "utf-8")).digest("hex");

// Cách ký nguyên văn trong code mẫu Node.js của VNPay (sortObject + querystring.stringify encode:false)
// — dùng làm "đáp án" độc lập để bắt lỗi nếu buildSignData lệch quy ước của VNPay.
function vnpaySampleSignData(obj) {
  const sorted = {};
  const keys = Object.keys(obj).map(encodeURIComponent).sort();
  for (const k of keys) sorted[k] = encodeURIComponent(obj[k]).replace(/%20/g, "+");
  return querystring.stringify(sorted, "&", "=", { encodeURIComponent: (s) => s });
}

/** Tham số giống VNPay gửi về IPN/Return URL, đã ký đúng. */
function signedReturn(overrides = {}) {
  const p = {
    vnp_Amount: "200000000",
    vnp_BankCode: "NCB",
    vnp_BankTranNo: "VNP14000000",
    vnp_CardType: "ATM",
    vnp_OrderInfo: "Thanh toan ve may bay booking 665f1c2e8b3a4d0012345678",
    vnp_PayDate: "20261015103000",
    vnp_ResponseCode: "00",
    vnp_TmnCode: "TESTTMN1",
    vnp_TransactionNo: "14000000",
    vnp_TransactionStatus: "00",
    vnp_TxnRef: "665f1c2e8b3a4d00123456781760000000000",
    ...overrides,
  };
  return { ...p, vnp_SecureHashType: "HmacSHA512", vnp_SecureHash: hmac(vnpaySampleSignData(p)) };
}

test("buildSignData: khớp cách ký trong code mẫu của VNPay (sắp xếp key, khoảng trắng thành +)", () => {
  const params = {
    vnp_TxnRef: "ABC123",
    vnp_OrderInfo: "Thanh toan don hang: 1/2 (test)",
    vnp_Amount: 5000000,
    vnp_ReturnUrl: "http://localhost:3000/vi/payment",
    vnp_Locale: "vn",
  };
  assert.equal(vnpay.buildSignData(params), vnpaySampleSignData(params));
  assert.ok(vnpay.buildSignData(params).startsWith("vnp_Amount=5000000&vnp_Locale=vn&vnp_OrderInfo=Thanh+toan"));
});

test("createPaymentUrl: số tiền nhân 100, có chữ ký hợp lệ, đúng TmnCode/locale/ngày giờ VN", () => {
  const { payUrl, createDate } = vnpay.createPaymentUrl({
    txnRef: "665f1c2e8b3a4d00123456781760000000000",
    amount: 1_500_000,
    orderInfo: "Thanh toan ve may bay",
    returnUrl: "http://localhost:3000/en/payment",
    ipAddr: "1.2.3.4",
    locale: "en",
    createDate: new Date("2026-10-15T03:00:00Z"),
  });
  assert.equal(createDate, "20261015100000"); // 03:00 UTC = 10:00 giờ VN
  const url = new URL(payUrl);
  assert.equal(url.origin + url.pathname, "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html");
  const q = Object.fromEntries(url.searchParams);
  assert.equal(q.vnp_Amount, "150000000");
  assert.equal(q.vnp_TmnCode, "TESTTMN1");
  assert.equal(q.vnp_Locale, "en");
  assert.equal(q.vnp_Command, "pay");
  assert.equal(q.vnp_Version, "2.1.0");
  const { vnp_SecureHash, ...rest } = q;
  assert.equal(vnp_SecureHash, hmac(vnpaySampleSignData(rest)));
});

test("createPaymentUrl: số tiền không phải số nguyên dương bị từ chối", () => {
  for (const amount of [0, -1000, 1000.5, "1000"]) {
    assert.throws(
      () => vnpay.createPaymentUrl({ txnRef: "X", amount, orderInfo: "x", returnUrl: "http://localhost/x" }),
      vnpay.VnpayClientError
    );
  }
});

test("verifyReturnParams: chữ ký đúng được chấp nhận (kể cả hash viết hoa)", () => {
  const q = signedReturn();
  assert.equal(vnpay.verifyReturnParams(q), true);
  assert.equal(vnpay.verifyReturnParams({ ...q, vnp_SecureHash: q.vnp_SecureHash.toUpperCase() }), true);
});

test("verifyReturnParams: sửa số tiền / mã kết quả sau khi ký thì bị từ chối", () => {
  const q = signedReturn({ vnp_ResponseCode: "24", vnp_TransactionStatus: "02" });
  assert.equal(vnpay.verifyReturnParams({ ...q, vnp_Amount: "100" }), false);
  assert.equal(vnpay.verifyReturnParams({ ...q, vnp_ResponseCode: "00", vnp_TransactionStatus: "00" }), false);
});

test("verifyReturnParams: ký đúng nhưng TmnCode của merchant khác → bị từ chối", () => {
  assert.equal(vnpay.verifyReturnParams(signedReturn({ vnp_TmnCode: "OTHERTMN" })), false);
});

test("verifyReturnParams: thiếu / sai định dạng chữ ký, tham số lặp không làm văng lỗi", () => {
  const q = signedReturn();
  assert.equal(vnpay.verifyReturnParams({ ...q, vnp_SecureHash: undefined }), false);
  assert.equal(vnpay.verifyReturnParams({ ...q, vnp_SecureHash: "zzzz" }), false);
  assert.equal(vnpay.verifyReturnParams({ ...q, vnp_Amount: ["200000000", "1"] }), false);
  assert.equal(vnpay.verifyReturnParams(null), false);
});

test("normalizeResult: phân loại thành công / thất bại / đang xử lý / không tìm thấy, tiền chia 100", () => {
  const ok = vnpay.normalizeResult({ vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_Amount: "200000000", vnp_TransactionNo: "14000000", vnp_TxnRef: "R" });
  assert.deepEqual([ok.status, ok.amount, ok.transId, ok.txnRef], ["success", 2_000_000, "14000000", "R"]);
  assert.equal(vnpay.normalizeResult({ vnp_ResponseCode: "24", vnp_TransactionStatus: "02", vnp_TransactionNo: "0" }).status, "failed");
  assert.equal(vnpay.normalizeResult({ vnp_ResponseCode: "24", vnp_TransactionStatus: "02", vnp_TransactionNo: "0" }).transId, undefined);
  assert.equal(vnpay.normalizeResult({ vnp_ResponseCode: "00", vnp_TransactionStatus: "02" }).status, "failed");
  assert.equal(vnpay.normalizeResult({ vnp_ResponseCode: "00", vnp_TransactionStatus: "01" }).status, "pending");
  assert.equal(vnpay.normalizeResult({ vnp_ResponseCode: "91" }).status, "not_found");
  assert.equal(vnpay.normalizeResult({ vnp_ResponseCode: "00", vnp_TransactionStatus: "05" }).status, "other");
});

test("queryTransaction: gọi đúng endpoint querydr, chữ ký nối '|' đúng thứ tự, chuẩn hóa kết quả", async () => {
  const realFetch = global.fetch;
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return {
      json: async () => ({
        vnp_ResponseCode: "00", vnp_TmnCode: "TESTTMN1", vnp_TxnRef: "ORD1", vnp_Amount: "5000000",
        vnp_TransactionNo: "14000001", vnp_TransactionStatus: "00",
      }),
    };
  };
  try {
    const result = await vnpay.queryTransaction({ txnRef: "ORD1", transactionDate: "20261015100000" });
    assert.equal(captured.url, "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction");
    const b = captured.body;
    assert.equal(b.vnp_Command, "querydr");
    assert.equal(b.vnp_TxnRef, "ORD1");
    assert.equal(b.vnp_TransactionDate, "20261015100000");
    assert.ok(b.vnp_RequestId.length <= 32);
    const data = [b.vnp_RequestId, b.vnp_Version, b.vnp_Command, b.vnp_TmnCode, b.vnp_TxnRef,
      b.vnp_TransactionDate, b.vnp_CreateDate, b.vnp_IpAddr, b.vnp_OrderInfo].join("|");
    assert.equal(b.vnp_SecureHash, hmac(data));
    assert.deepEqual([result.status, result.amount, result.transId], ["success", 50_000, "14000001"]);
  } finally {
    global.fetch = realFetch;
  }
});

test("queryTransaction: '91' = không có giao dịch; lệch đơn hàng / bị từ chối / lỗi mạng / rác → ném lỗi", async () => {
  const realFetch = global.fetch;
  const reply = (data) => { global.fetch = async () => ({ json: async () => data }); };
  try {
    reply({ vnp_ResponseCode: "91", vnp_Message: "Not found" });
    assert.equal((await vnpay.queryTransaction({ txnRef: "ORD1", transactionDate: "x" })).status, "not_found");

    reply({ vnp_ResponseCode: "00", vnp_TmnCode: "TESTTMN1", vnp_TxnRef: "OTHER", vnp_TransactionStatus: "00" });
    await assert.rejects(vnpay.queryTransaction({ txnRef: "ORD1", transactionDate: "x" }), vnpay.VnpayClientError);

    reply({ vnp_ResponseCode: "97", vnp_Message: "Invalid checksum" });
    await assert.rejects(vnpay.queryTransaction({ txnRef: "ORD1", transactionDate: "x" }), /97/);

    reply({ foo: "bar" });
    await assert.rejects(vnpay.queryTransaction({ txnRef: "ORD1", transactionDate: "x" }), vnpay.VnpayClientError);

    global.fetch = async () => { throw new Error("ECONNRESET"); };
    await assert.rejects(vnpay.queryTransaction({ txnRef: "ORD1", transactionDate: "x" }), vnpay.VnpayClientError);
  } finally {
    global.fetch = realFetch;
  }
});

test("cấu hình không an toàn: VNPAY_API_URL dùng http:// (không phải localhost) hoặc thiếu khóa → từ chối", async () => {
  const saved = { ...process.env };
  try {
    process.env.VNPAY_API_URL = "http://evil.example.com/api";
    await assert.rejects(vnpay.queryTransaction({ txnRef: "x", transactionDate: "x" }), /https/);
    process.env.VNPAY_API_URL = saved.VNPAY_API_URL;
    delete process.env.VNPAY_HASH_SECRET;
    assert.throws(() => vnpay.verifyReturnParams(signedReturn()), /VNPAY_HASH_SECRET/);
  } finally {
    Object.assign(process.env, saved);
  }
});
