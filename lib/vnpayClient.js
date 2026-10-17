const crypto = require("crypto");
const { toVN } = require("./timezone");

const VNP_VERSION = "2.1.0";
const DEFAULT_PAY_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const DEFAULT_API_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";

// Không để một lần gọi VNPay treo vô hạn (giữ tài nguyên xử lý trang thanh toán).
const VNPAY_TIMEOUT_MS = 15_000;

/** Lỗi gọi VNPay (mạng lỗi, phản hồi rác, thiếu cấu hình...). */
class VnpayClientError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getConfig() {
  return {
    tmnCode: process.env.VNPAY_TMN_CODE,
    hashSecret: process.env.VNPAY_HASH_SECRET,
    payUrl: process.env.VNPAY_PAY_URL || DEFAULT_PAY_URL,
    apiUrl: process.env.VNPAY_API_URL || DEFAULT_API_URL,
  };
}

// Phản hồi truy vấn VNPay là căn cứ để xác nhận thanh toán → bắt buộc kênh HTTPS.
function assertSecureUrl(name, url) {
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) {
    throw new VnpayClientError(`${name} phải dùng https://.`, 500);
  }
}

function assertConfigured() {
  const cfg = getConfig();
  if (!cfg.tmnCode || !cfg.hashSecret) {
    throw new VnpayClientError(
      "Thiếu cấu hình VNPay (VNPAY_TMN_CODE/VNPAY_HASH_SECRET) trong .env.local.",
      500
    );
  }
  assertSecureUrl("VNPAY_PAY_URL", cfg.payUrl);
  assertSecureUrl("VNPAY_API_URL", cfg.apiUrl);
  return cfg;
}

/** HMAC-SHA512(data, hashSecret) → hex. Dùng chung cho URL thanh toán, IPN/Return và querydr. */
function hmacSha512(data, hashSecret) {
  return crypto.createHmac("sha512", hashSecret).update(Buffer.from(data, "utf-8")).digest("hex");
}

/** Chuỗi dữ liệu để ký theo đúng cách code mẫu Node.js của VNPay: sắp xếp key theo alphabet. */
function buildSignData(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .map((k) => [encodeURIComponent(k), encodeURIComponent(String(params[k])).replace(/%20/g, "+")])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/** Định dạng thời gian VNPay yêu cầu: yyyyMMddHHmmss theo giờ Việt Nam (GMT+7). */
function formatVnpDate(date) {
  return toVN(date).format("YYYYMMDDHHmmss");
}

/** Dựng URL thanh toán VNPay có chữ ký — khách được redirect sang đây để chọn ngân hàng/nhập thẻ. */
function createPaymentUrl({
  txnRef,
  amount,
  orderInfo,
  returnUrl,
  ipAddr,
  locale = "vi",
  createDate = new Date(),
  expireDate,
}) {
  const cfg = assertConfigured();
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new VnpayClientError("Số tiền thanh toán không hợp lệ.", 400);
  }

  const vnpCreateDate = formatVnpDate(createDate);
  const params = {
    vnp_Version: VNP_VERSION,
    vnp_Command: "pay",
    vnp_TmnCode: cfg.tmnCode,
    vnp_Amount: amount * 100,
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: locale === "en" ? "en" : "vn",
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || "127.0.0.1",
    vnp_CreateDate: vnpCreateDate,
    vnp_ExpireDate: expireDate ? formatVnpDate(expireDate) : undefined,
  };

  const signData = buildSignData(params);
  const secureHash = hmacSha512(signData, cfg.hashSecret);
  return { payUrl: `${cfg.payUrl}?${signData}&vnp_SecureHash=${secureHash}`, createDate: vnpCreateDate };
}

/** Xác minh chữ ký bộ tham số VNPay gửi về (IPN hoặc Return URL — cùng định dạng). */
function verifyReturnParams(query) {
  const cfg = assertConfigured();
  if (!query || typeof query.vnp_SecureHash !== "string" || !query.vnp_SecureHash) return false;
  if (query.vnp_TmnCode !== cfg.tmnCode) return false;

  const rest = {};
  for (const [k, v] of Object.entries(query)) {
    if (!k.startsWith("vnp_") || k === "vnp_SecureHash" || k === "vnp_SecureHashType") continue;
    // Tham số lặp (?a=1&a=2) không phải dữ liệu VNPay gửi — coi là giả.
    if (typeof v !== "string") return false;
    rest[k] = v;
  }

  const expectedBuf = Buffer.from(hmacSha512(buildSignData(rest), cfg.hashSecret), "hex");
  const actualBuf = Buffer.from(query.vnp_SecureHash.toLowerCase(), "hex");
  // So khớp độ dài trước — crypto.timingSafeEqual ném lỗi nếu 2 buffer khác length.
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** Chuẩn hóa kết quả giao dịch. */
function normalizeResult(data) {
  const responseCode = String(data.vnp_ResponseCode ?? "");
  const transactionStatus = String(data.vnp_TransactionStatus ?? "");
  let status;
  if (responseCode === "91") status = "not_found";
  else if (responseCode === "00" && transactionStatus === "00") status = "success";
  else if (transactionStatus === "01") status = "pending";
  else if (transactionStatus === "02" || (responseCode !== "00" && transactionStatus === "")) status = "failed";
  else status = "other";

  const transNo = data.vnp_TransactionNo;
  return {
    status,
    txnRef: data.vnp_TxnRef,
    amount: Number(data.vnp_Amount) / 100,
    // VNPay trả "0" cho giao dịch chưa có mã ở VNPay (VD khách hủy ngay trên trang thanh toán).
    transId: transNo !== undefined && transNo !== null && String(transNo) !== "0" && String(transNo) !== "" ? String(transNo) : undefined,
    responseCode,
    transactionStatus,
  };
}

/** Chuỗi dữ liệu ký cho request querydr — nối bằng "|" đúng thứ tự theo tài liệu VNPay. */
function buildQuerySignData(body) {
  return [
    body.vnp_RequestId,
    body.vnp_Version,
    body.vnp_Command,
    body.vnp_TmnCode,
    body.vnp_TxnRef,
    body.vnp_TransactionDate,
    body.vnp_CreateDate,
    body.vnp_IpAddr,
    body.vnp_OrderInfo,
  ].join("|");
}

/** Hỏi VNPay kết quả của 1 giao dịch đã tạo (API querydr). */
async function queryTransaction({ txnRef, transactionDate, ipAddr = "127.0.0.1" }) {
  const cfg = assertConfigured();

  const body = {
    vnp_RequestId: crypto.randomUUID().replace(/-/g, ""),
    vnp_Version: VNP_VERSION,
    vnp_Command: "querydr",
    vnp_TmnCode: cfg.tmnCode,
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: `Truy van giao dich ${txnRef}`,
    vnp_TransactionDate: transactionDate,
    vnp_CreateDate: formatVnpDate(new Date()),
    vnp_IpAddr: ipAddr,
  };
  body.vnp_SecureHash = hmacSha512(buildQuerySignData(body), cfg.hashSecret);

  let response;
  try {
    response = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VNPAY_TIMEOUT_MS),
    });
  } catch (err) {
    throw new VnpayClientError(`Không gọi được API truy vấn VNPay: ${err.message}`);
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.vnp_ResponseCode !== "string") {
    throw new VnpayClientError("Phản hồi truy vấn từ VNPay không hợp lệ.");
  }
  // "91" (không tìm thấy giao dịch) có thể không kèm TmnCode/TxnRef — vẫn là kết quả hợp lệ.
  if (data.vnp_ResponseCode !== "91") {
    if (data.vnp_ResponseCode !== "00") {
      throw new VnpayClientError(`VNPay từ chối truy vấn: ${data.vnp_Message || "lỗi không rõ"} (mã ${data.vnp_ResponseCode})`);
    }
    if (data.vnp_TmnCode !== cfg.tmnCode || data.vnp_TxnRef !== txnRef) {
      throw new VnpayClientError("Phản hồi truy vấn VNPay không khớp đơn hàng.");
    }
  }
  return normalizeResult(data);
}

module.exports = {
  VnpayClientError,
  buildSignData,
  buildQuerySignData,
  formatVnpDate,
  createPaymentUrl,
  verifyReturnParams,
  normalizeResult,
  queryTransaction,
};
