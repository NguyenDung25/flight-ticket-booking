// lib/momoClient.js
//
// C6 — client "thô" gọi API thanh toán Momo thật (cổng AIO, requestType
// 'captureWallet'), theo đúng tài liệu tích hợp công khai của Momo. File này
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
 * requestType `captureWallet` (quét QR / mở app Momo) — phù hợp luồng web C6.
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
}) {
  assertConfigured();

  const requestId = `${PARTNER_CODE}-${Date.now()}`;
  const requestType = "captureWallet";
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

module.exports = {
  MomoClientError,
  createPaymentRequest,
  verifyIpnSignature,
};
