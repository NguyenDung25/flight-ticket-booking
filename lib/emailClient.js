const nodemailer = require("nodemailer");
const { toVN } = require("./timezone");

// Lỗi bảo mật đã sửa (HTML injection qua email): file này tự ghép chuỗi HTML bằng template string thô.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Lazy-init transporter — chỉ tạo 1 lần, tái dùng cho mọi lần gửi.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // true nếu dùng cổng SSL trực tiếp (465), false thì STARTTLS (587)
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

const SUBJECT_BY_LOCALE = {
  vi: (code) => `DelayX — Vé điện tử — Mã đặt chỗ ${code}`,
  en: (code) => `DelayX — Electronic Ticket Receipt — Booking code ${code}`,
};

const LEG_LABEL = {
  vi: { outbound: "Chặng đi", return: "Chặng về" },
  en: { outbound: "Outbound", return: "Return" },
};

function formatLegRow(leg, locale) {
  const dep = toVN(leg.departure_time).format("DD/MM/YYYY HH:mm");
  const arr = toVN(leg.arrival_time).format("HH:mm DD/MM/YYYY");
  const label = (LEG_LABEL[locale] || LEG_LABEL.vi)[leg.leg];
  return `<tr>
    <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(label)}</td>
    <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(leg.flight_number)}</td>
    <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(leg.origin_code)} → ${escapeHtml(leg.dest_code)}</td>
    <td style="padding:8px;border:1px solid #ddd;">${dep} - ${arr}</td>
  </tr>`;
}

function formatPassengerRow(passenger, locale) {
  const isEn = locale === "en";
  const seatList = passenger.seats
    .map((s) => {
      const extras = [
        isEn ? `${s.checked_baggage_kg || 0}kg checked baggage` : `ký gửi ${s.checked_baggage_kg || 0}kg`,
        ...(s.meal ? [isEn ? "meal" : "suất ăn"] : []),
      ].join(", ");
      return `${escapeHtml(s.seat_number)} (${escapeHtml(extras)})`;
    })
    .join("; ");
  return `<li>${escapeHtml(passenger.full_name)} — ${isEn ? "seat" : "ghế"} ${seatList}</li>`;
}

/** Build nội dung HTML email vé điện tử từ ticketData (services/ticketService.js). */
function buildEmailHtml(ticketData) {
  const { locale, booking_code, legs, passengers, total_amount } = ticketData;
  const isEn = locale === "en";

  const legsHtml = legs.map((leg) => formatLegRow(leg, locale)).join("");
  const passengersHtml = passengers.map((p) => formatPassengerRow(p, locale)).join("");
  const totalFormatted = total_amount.toLocaleString("vi-VN") + "đ";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>${isEn ? "Electronic Ticket Receipt" : "Vé điện tử"} — ${escapeHtml(booking_code)}</h2>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">${isEn ? "Leg" : "Chặng"}</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">${isEn ? "Flight" : "Số hiệu"}</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">${isEn ? "Route" : "Tuyến bay"}</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">${isEn ? "Time" : "Thời gian"}</th>
          </tr>
        </thead>
        <tbody>${legsHtml}</tbody>
      </table>
      <p><strong>${isEn ? "Passengers" : "Hành khách"}:</strong></p>
      <ul>${passengersHtml}</ul>
      <p><strong>${isEn ? "Total" : "Tổng tiền"}:</strong> ${totalFormatted}</p>
    </div>`;
}

/** Gửi email vé điện tử tới 1 địa chỉ. */
async function sendTicketEmail({ to, ticketData }) {
  const subjectFn = SUBJECT_BY_LOCALE[ticketData.locale] || SUBJECT_BY_LOCALE.vi;
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: subjectFn(ticketData.booking_code),
    html: buildEmailHtml(ticketData),
  });
}

/** SMTP đã cấu hình đủ để gửi thật chưa (thiếu thì nodemailer báo "Missing credentials"). */
function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

const RESET_EMAIL = {
  vi: {
    subject: "DelayX — Đặt lại mật khẩu",
    body: (name, link, minutes) => `
      <p>Xin chào ${escapeHtml(name)},</p>
      <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản DelayX của bạn. Bấm vào link dưới đây để đặt mật khẩu mới (link có hiệu lực trong ${minutes} phút và chỉ dùng được 1 lần):</p>
      <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
      <p>Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>`,
  },
  en: {
    subject: "DelayX — Reset your password",
    body: (name, link, minutes) => `
      <p>Hello ${escapeHtml(name)},</p>
      <p>We received a request to reset the password of your DelayX account. Click the link below to choose a new password (valid for ${minutes} minutes, single use):</p>
      <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
      <p>If you did not request this, you can ignore this email — your current password stays the same.</p>`,
  },
};

/** Gửi link đặt lại mật khẩu. */
async function sendPasswordResetEmail({ to, name, link, locale, minutes }) {
  const tpl = RESET_EMAIL[locale] || RESET_EMAIL.vi;
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] Chưa cấu hình SMTP — link đặt lại mật khẩu cho ${to}: ${link}`);
    }
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject: tpl.subject,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">${tpl.body(name, link, minutes)}</div>`,
    });
    return true;
  } catch (err) {
    console.error("Gửi email đặt lại mật khẩu thất bại:", err.message);
    return false;
  }
}

const VERIFY_EMAIL = {
  vi: {
    subject: "DelayX — Xác thực email",
    body: (name, link, hours) => `
      <p>Xin chào ${escapeHtml(name)},</p>
      <p>Cảm ơn bạn đã đăng ký DelayX. Bấm vào link dưới đây để xác thực email (link có hiệu lực trong ${hours} giờ). Sau khi xác thực, bạn có thể đặt vé và nhận vé điện tử qua email này:</p>
      <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
      <p>Nếu bạn không đăng ký tài khoản DelayX, hãy bỏ qua email này.</p>`,
  },
  en: {
    subject: "DelayX — Verify your email",
    body: (name, link, hours) => `
      <p>Hello ${escapeHtml(name)},</p>
      <p>Thank you for signing up with DelayX. Click the link below to verify your email (valid for ${hours} hours). Once verified, you can book flights and receive e-tickets at this address:</p>
      <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
      <p>If you did not create a DelayX account, you can ignore this email.</p>`,
  },
};

/** Gửi link xác thực email. */
async function sendVerificationEmail({ to, name, link, locale, hours }) {
  const tpl = VERIFY_EMAIL[locale] || VERIFY_EMAIL.vi;
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] Chưa cấu hình SMTP — link xác thực email cho ${to}: ${link}`);
    }
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject: tpl.subject,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">${tpl.body(name, link, hours)}</div>`,
    });
    return true;
  } catch (err) {
    console.error("Gửi email xác thực thất bại:", err.message);
    return false;
  }
}

module.exports = {
  sendTicketEmail,
  buildEmailHtml,
  isEmailConfigured,
  sendPasswordResetEmail,
  sendVerificationEmail,
};