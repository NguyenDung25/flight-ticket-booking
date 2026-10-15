// lib/clientIp.js
//
// Lấy IP người gọi để khóa chống dò (check-in) và gửi vnp_IpAddr cho VNPay.
//
// KHÔNG tin header X-Forwarded-For mặc định: header này do chính người gọi tự gửi được, nếu lấy nó
// làm khóa chống dò thì kẻ dò chỉ cần đổi giá trị mỗi lần là không bao giờ bị khóa. Chỉ khi app chạy
// sau 1 proxy tin cậy (ngrok, Nginx...) và đặt TRUST_PROXY=true thì mới đọc header — và lấy địa chỉ
// CUỐI CÙNG trong danh sách (do proxy của mình nối vào), không lấy địa chỉ đầu (người gọi tự khai).
//
// Không tin proxy: Next.js route handler không cho biết IP socket thật, nên mọi request dùng chung 1
// khóa "direct" — vẫn chặn được dò hàng loạt (giới hạn chung), đánh đổi là 1 người dò có thể làm
// người khác bị khóa tạm. Chấp nhận cho đồ án chạy local.

const DIRECT = "direct";

/**
 * @param {Headers} headers - request.headers
 * @param {{ trustProxy?: boolean }} [opts] - mặc định đọc biến môi trường TRUST_PROXY
 * @returns {string} IP (khi tin proxy) hoặc "direct"
 */
function clientIp(headers, { trustProxy = process.env.TRUST_PROXY === "true" } = {}) {
  if (!trustProxy) return DIRECT;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip") || DIRECT;
}

/** IP gửi cho VNPay (vnp_IpAddr phải là địa chỉ IP hợp lệ, "direct" không dùng được). */
function ipForGateway(headers) {
  const ip = clientIp(headers);
  return ip === DIRECT ? "127.0.0.1" : ip;
}

module.exports = { clientIp, ipForGateway, DIRECT };
