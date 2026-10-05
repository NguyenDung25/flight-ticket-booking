// lib/momoClient.js
//
// C6 — client "thô" gọi API thanh toán Momo thật (cổng AIO, requestType
// 'payWithATM' — thẻ ATM nội địa), theo đúng tài liệu tích hợp công khai của Momo. File này
// CHỈ lo phần giao tiếp HTTP + build/verify chữ ký HMAC-SHA256 — KHÔNG chứa
// logic nghiệp vụ (đổi status Booking, confirm ghế, gửi vé...), việc đó
// thuộc về services/paymentService.js — đúng nguyên tắc lib/ vs services/
// đã áp dụng cho lib/emailClient.js.
//
// Đọc cấu hình từ .env.local: MOMO_PARTNER_CODE, MOMO_ACCESS_KEY,
// MOMO_SECRET_KEY, MOMO_API_URL.

const crypto = require("crypto");

const PARTNER_CODE = process.env.MOMO_PARTNER_CODE;
const ACCESS_KEY = process.env.MOMO_ACCESS_KEY;
const SECRET_KEY = process.env.MOMO_SECRET_KEY;
const API_URL = process.env.MOMO_API_URL;

// Hiển thị trên màn hình thanh toán của app Momo — không phải dữ liệu bí mật.
const PARTNER_NAME = "Sun Phu Quoc Airways";

/**
 * requestType hệ thống dùng: `payWithATM` — thanh toán bằng thẻ ATM nội địa
 * (Napas) qua cổng MoMo. Khách nhập thẻ ngay trên trang payUrl của MoMo,
 * KHÔNG cần cài app MoMo (hệ thống không dùng luồng ví MoMo/quét QR).
 * Vẫn cùng endpoint /v2/gateway/api/create, cùng công thức chữ ký, cùng IPN.
 */
const REQUEST_TYPES = Object.freeze({
  ATM: "payWithATM",
});
const SUPPORTED_REQUEST_TYPES = Object.values(REQUEST_TYPES);

/** Lỗi gọi Momo (mạng lỗi, Momo từ chối request, thiếu cấu hình...). */
class MomoClientError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function assertConfigured() {
  if (!PARTNER_CODE || !ACCESS_KEY || !SECRET_KEY || !API_URL) {
    throw new MomoClientError(
      "Thiếu cấu hình Momo (MOMO_PARTNER_CODE/MOMO_ACCESS_KEY/MOMO_SECRET_KEY/MOMO_API_URL) trong .env.local.",
      500
    );
  }
}

/** HMAC-SHA256(rawSignature, secretKey) → hex string. Dùng chung cho cả tạo request lẫn verify IPN. */
function sign(rawSignature) {
  return crypto.createHmac("sha256", SECRET_KEY).update(rawSignature).digest("hex");
}

/**
 * rawSignature cho request TẠO thanh toán — ĐÚNG THỨ TỰ field theo tài liệu
 * Momo (không phải thứ tự alphabet ngẫu nhiên, KHÔNG được tự sắp xếp lại,
 * sai thứ tự → chữ ký sai → Momo từ chối request):
 * accessKey, amount, extraData, ipnUrl, orderId, orderInfo, partnerCode,
 * redirectUrl, requestId, requestType.
 */
function buildCreateRawSignature({
  amount,
  extraData,
  ipnUrl,
  orderId,
  orderInfo,
  redirectUrl,
  requestId,
  requestType,
}) {
  return (
    `accessKey=${ACCESS_KEY}` +
    `&amount=${amount}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${ipnUrl}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${PARTNER_CODE}` +
    `&redirectUrl=${redirectUrl}` +
    `&requestId=${requestId}` +
    `&requestType=${requestType}`
  );
}

/**
 * Gọi API "Tạo yêu cầu thanh toán" (`POST {MOMO_API_URL}/v2/gateway/api/create`),
 * requestType `payWithATM` (thẻ ATM nội địa qua cổng Momo) — luồng web C6.
 *
 * @param {Object} params
 * @param {String} params.orderId - PHẢI DUY NHẤT cho mỗi lần gọi. Sinh ở
 *   services/paymentService.js (KHÔNG dùng thẳng bookingId — 1 booking có thể
 *   thử thanh toán lại nhiều lần nếu lần trước Momo báo `failed`).
 * @param {Number} params.amount
 * @param {String} params.orderInfo - mô tả hiển thị trên app Momo cho khách
 * @param {String} params.redirectUrl - khách được điều hướng về sau khi thanh toán xong (app/[locale]/payment/page.js)
 * @param {String} params.ipnUrl - endpoint webhook Momo gọi ngầm (POST /api/payments/[bookingId])
 * @param {String} [params.extraData=""] - chuỗi tùy chọn, Momo trả nguyên vẹn lại ở IPN
 * @param {String} [params.requestType="payWithATM"] - một trong REQUEST_TYPES
 * @returns {Promise<{ payUrl: String, deeplink: String, qrCodeUrl: String, requestId: String, orderId: String }>}
 * @throws {MomoClientError} nếu thiếu cấu hình, lỗi mạng, hoặc Momo trả resultCode khác 0
 */
async function createPaymentRequest({
  orderId,
  amount,
  orderInfo,
  redirectUrl,
  ipnUrl,
  extraData = "",
  requestType = REQUEST_TYPES.ATM,
}) {
  assertConfigured();

  // Chặn giá trị lạ TRƯỚC khi ký/gửi — requestType nằm trong chữ ký, không
  // nên để chuỗi tùy ý từ phía gọi lọt thẳng sang Momo.
  if (!SUPPORTED_REQUEST_TYPES.includes(requestType)) {
    throw new MomoClientError(`requestType không được hỗ trợ: '${requestType}'.`, 400);
  }

  const requestId = `${PARTNER_CODE}-${Date.now()}`;
  const lang = "vi";

  const rawSignature = buildCreateRawSignature({
    amount,
    extraData,
    ipnUrl,
    orderId,
    orderInfo,
    redirectUrl,
    requestId,
    requestType,
  });
  const signature = sign(rawSignature);

  const body = {
    partnerCode: PARTNER_CODE,
    partnerName: PARTNER_NAME,
    storeId: PARTNER_CODE,
    requestId,
    amount: String(amount),
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    lang,
    extraData,
    requestType,
    signature,
  };

  let response;
  try {
    response = await fetch(`${API_URL}/v2/gateway/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new MomoClientError(`Không gọi được API Momo: ${err.message}`);
  }

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new MomoClientError("Phản hồi từ Momo không phải JSON hợp lệ.");
  }
  if (data.resultCode !== 0) {
    throw new MomoClientError(
      `Momo từ chối yêu cầu thanh toán: ${data.message || "lỗi không rõ"} (resultCode ${data.resultCode})`
    );
  }

  return {
    payUrl: data.payUrl,
    deeplink: data.deeplink,
    qrCodeUrl: data.qrCodeUrl,
    requestId,
    orderId,
  };
}

/**
 * rawSignature để đối chiếu chữ ký IPN Momo gửi về — ĐÚNG THỨ TỰ field theo
 * tài liệu (KHÁC thứ tự lúc tạo request ở trên): accessKey, amount,
 * extraData, message, orderId, orderInfo, orderType, partnerCode, payType,
 * requestId, responseTime, resultCode, transId.
 */
function buildIpnRawSignature(payload) {
  const {
    amount,
    extraData,
    message,
    orderId,
    orderInfo,
    orderType,
    partnerCode,
    payType,
    requestId,
    responseTime,
    resultCode,
    transId,
  } = payload;
  return (
    `accessKey=${ACCESS_KEY}` +
    `&amount=${amount}` +
    `&extraData=${extraData}` +
    `&message=${message}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&orderType=${orderType}` +
    `&partnerCode=${partnerCode}` +
    `&payType=${payType}` +
    `&requestId=${requestId}` +
    `&responseTime=${responseTime}` +
    `&resultCode=${resultCode}` +
    `&transId=${transId}`
  );
}

/**
 * Xác minh chữ ký của payload IPN Momo gửi tới webhook
 * (`POST /api/payments/[bookingId]`) — services/paymentService.js BẮT BUỘC
 * gọi hàm này TRƯỚC KHI tin bất kỳ field nào trong payload (đặc biệt
 * `resultCode`), tránh giả mạo webhook để chiếm ghế/vé mà không mất tiền.
 *
 * @param {Object} payload - JSON body Momo POST tới webhook
 * @returns {Boolean}
 */
function verifyIpnSignature(payload) {
  assertConfigured();
  if (!payload || typeof payload.signature !== "string" || !payload.signature) {
    return false;
  }
  const expected = sign(buildIpnRawSignature(payload));
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(payload.signature, "hex");
  // So khớp độ dài trước — crypto.timingSafeEqual ném lỗi nếu 2 buffer khác length,
  // (VD chữ ký giả không đúng định dạng hex 64 ký tự) thay vì trả về false gọn gàng.
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * rawSignature cho request TRUY VẤN trạng thái giao dịch — thứ tự field theo tài
 * liệu Momo (alphabet): accessKey, orderId, partnerCode, requestId.
 */
function buildQueryRawSignature({ orderId, requestId }) {
  return (
    `accessKey=${ACCESS_KEY}` +
    `&orderId=${orderId}` +
    `&partnerCode=${PARTNER_CODE}` +
    `&requestId=${requestId}`
  );
}

/**
 * Hỏi Momo kết quả của 1 giao dịch đã tạo (`POST {MOMO_API_URL}/v2/gateway/api/query`).
 * Dùng làm đường dự phòng khi IPN (server -> server) không về được, VD ngrok tắt.
 *
 * KHÔNG ném lỗi khi Momo trả resultCode khác 0 — với API truy vấn, resultCode chính
 * là TRẠNG THÁI giao dịch (0 = đã thanh toán; 1000/7000/7002/9000 = đang xử lý...),
 * nơi gọi tự diễn giải. Chỉ ném khi mạng lỗi hoặc phản hồi không phải JSON.
 *
 * @param {Object} params
 * @param {String} params.orderId - orderId đã gửi lúc tạo giao dịch (Booking.payment.last_order_id)
 * @returns {Promise<{ resultCode: Number, message: String, amount: Number|undefined, transId: Number|undefined, orderId: String }>}
 */
async function queryTransaction({ orderId }) {
  assertConfigured();

  const requestId = `${PARTNER_CODE}-${Date.now()}`;
  const signature = sign(buildQueryRawSignature({ orderId, requestId }));

  let response;
  try {
    response = await fetch(`${API_URL}/v2/gateway/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerCode: PARTNER_CODE, requestId, orderId, lang: "vi", signature }),
    });
  } catch (err) {
    throw new MomoClientError(`Không gọi được API truy vấn Momo: ${err.message}`);
  }

  const data = await response.json().catch(() => null);
  if (!data || typeof data.resultCode !== "number") {
    throw new MomoClientError("Phản hồi truy vấn từ Momo không hợp lệ.");
  }
  return data;
}

module.exports = {
  MomoClientError,
  REQUEST_TYPES,
  createPaymentRequest,
  verifyIpnSignature,
  buildQueryRawSignature,
  queryTransaction,
};
