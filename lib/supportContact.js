// Hòm thư hỗ trợ khách hàng = hòm thư gửi email của dự án (EMAIL_FROM, nếu thiếu thì SMTP_USER).
// Đọc từ biến môi trường để không ghi cứng địa chỉ vào mã nguồn; không đọc mật khẩu SMTP.
function getSupportEmail(env = process.env) {
  const raw = (env.EMAIL_FROM || env.SMTP_USER || "").trim();
  const m = raw.match(/<([^<>\s]+@[^<>\s]+)>/) || raw.match(/^([^<>\s"]+@[^<>\s"]+)$/);
  return m ? m[1] : null;
}

module.exports = { getSupportEmail };
