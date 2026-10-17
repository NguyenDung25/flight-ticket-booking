const DIRECT = "direct";

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
