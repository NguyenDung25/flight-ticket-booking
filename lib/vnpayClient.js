// lib/vnpayClient.js
//
// C6 — client "thô" của cổng thanh toán VNPay (API v2.1.0, môi trường sandbox), theo tài liệu tích
// hợp công khai của VNPay. File này CHỈ lo: dựng URL thanh toán có chữ ký, xác minh chữ ký dữ liệu
// VNPay gửi về (IPN / Return URL), và gọi API truy vấn giao dịch (querydr) — KHÔNG chứa logic nghiệp
// vụ (đổi status Booking, confirm ghế, gửi vé...), việc đó thuộc services/paymentService.js — đúng
// nguyên tắc lib/ vs services/ đã áp dụng cho lib/emailClient.js.
//
// Đọc cấu hình từ .env.local: VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_PAY_URL, VNPAY_API_URL.
// Đọc LÚC GỌI (không phải lúc nạp module) để test đổi được cấu hình.
//
// Khác MoMo ở 3 điểm quan trọng:
// 1) Tạo thanh toán KHÔNG gọi mạng: chỉ ký bộ tham số rồi redirect khách sang VNPAY_PAY_URL.
// 2) IPN là request GET (tham số trên query string) và URL IPN cấu hình CỐ ĐỊNH ở trang quản trị
//    merchant của VNPay — không gửi kèm từng giao dịch như MoMo.
// 3) Số tiền gửi/nhận luôn NHÂN 100 (vnp_Amount = 150000000 nghĩa là 1.500.000đ).

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

// Phản hồi truy vấn VNPay là căn cứ để xác nhận thanh toán → bắt buộc kênh HTTPS (trừ khi trỏ về
// localhost để test). Tránh cấu hình nhầm http:// khiến phản hồi bị giả mạo/đọc trộm giữa đường.
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

/**
 * Chuỗi dữ liệu để ký theo đúng cách code mẫu Node.js của VNPay: sắp xếp key theo alphabet, mã hóa
 * key + value bằng encodeURIComponent (khoảng trắng thành "+"), nối "key=value" bằng "&". Bỏ qua
 * value rỗng/null. Chuỗi này cũng chính là query string gửi đi (không mã hóa thêm lần nữa).
 */
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

/**
 * Dựng URL thanh toán VNPay có chữ ký — khách được redirect sang đây để chọn ngân hàng/nhập thẻ.
 * KHÔNG gọi mạng.
 *
 * @param {Object} params
 * @param {String} params.txnRef - mã đơn hàng, DUY NHẤT cho mỗi lần thanh toán (sinh ở paymentService)
 * @param {Number} params.amount - số tiền VNĐ (hàm tự nhân 100 theo quy ước VNPay)
 * @param {String} params.orderInfo - mô tả đơn hàng, nên là tiếng Việt KHÔNG dấu, không ký tự đặc biệt
 * @param {String} params.returnUrl - VNPay đưa khách quay về đây sau khi thanh toán xong
 * @param {String} params.ipAddr - IP của khách
 * @param {String} [params.locale="vi"] - "vi" | "en" (đổi sang mã "vn" | "en" của VNPay)
 * @param {Date} [params.createDate=new Date()]
 * @param {Date} [params.expireDate] - hết hạn link thanh toán (mặc định VNPay: 15 phút)
 * @returns {{ payUrl: String, createDate: String }} createDate (yyyyMMddHHmmss) cần lưu lại để truy vấn
 */
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

/**
 * Xác minh chữ ký bộ tham số VNPay gửi về (IPN hoặc Return URL — cùng định dạng). services/
 * paymentService.js BẮT BUỘC gọi hàm này TRƯỚC KHI tin bất kỳ field nào (đặc biệt vnp_ResponseCode),
 * tránh giả mạo IPN để chiếm ghế/vé mà không mất tiền. Kiểm tra cả vnp_TmnCode đúng của hệ thống.
 *
 * @param {Object} query - toàn bộ tham số trên query string (đã giải mã URL)
 * @returns {Boolean}
 */
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

/**
 * Chuẩn hóa kết quả giao dịch (từ IPN đã xác minh chữ ký, hoặc từ querydr) về 1 dạng chung để
 * services/paymentService.js không phải biết mã lỗi riêng của VNPay.
 *
 * status:
 * - "success"   — vnp_ResponseCode "00" VÀ vnp_TransactionStatus "00": đã trừ tiền thành công
 * - "pending"   — vnp_TransactionStatus "01": giao dịch chưa hoàn tất
 * - "failed"    — vnp_TransactionStatus "02" (hoặc IPN mã lỗi khác "00"): thất bại dứt khoát
 * - "not_found" — querydr trả vnp_ResponseCode "91": VNPay không có giao dịch này (khách chưa thanh toán)
 * - "other"     — mọi trạng thái khác (hoàn tiền, nghi gian lận...) — không tự xử lý
 *
 * @returns {{ status: String, txnRef: String, amount: Number, transId: String|undefined, responseCode: String, transactionStatus: String }}
 */
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

/** Chuỗi dữ liệu ký cho request querydr — nối bằng "|" ĐÚNG THỨ TỰ theo tài liệu VNPay. */
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

/**
 * Hỏi VNPay kết quả của 1 giao dịch đã tạo (API querydr). Dùng ở trang kết quả thanh toán: khách
 * được VNPay đưa về Return URL thì server tự hỏi lại VNPay (server -> server) để chốt booking — nhờ
 * vậy chạy local KHÔNG cần ngrok vẫn xác nhận được thanh toán. KHÔNG tin tham số trên Return URL.
 *
 * Kênh HTTPS bắt buộc (assertSecureUrl) và vnp_TmnCode/vnp_TxnRef trong phản hồi phải khớp — đủ tin
 * cậy cho đồ án, không đối chiếu thêm chữ ký phản hồi (cùng mức với cách làm cũ của MoMo).
 *
 * @param {Object} params
 * @param {String} params.txnRef - Booking.payment.last_order_id
 * @param {String} params.transactionDate - Booking.payment.last_order_date (vnp_CreateDate lúc tạo)
 * @param {String} [params.ipAddr="127.0.0.1"]
 * @returns {Promise<ReturnType<typeof normalizeResult>>}
 * @throws {VnpayClientError} lỗi mạng, phản hồi không hợp lệ hoặc không khớp đơn hàng
 */
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
