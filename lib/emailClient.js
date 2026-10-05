// lib/emailClient.js
//
// C7 — gửi vé điện tử qua email bằng Nodemailer + SMTP thật. Đọc cấu hình từ
// .env.local: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM (nếu bỏ
// trống EMAIL_FROM thì dùng luôn SMTP_USER làm địa chỉ gửi).
//
// Ngôn ngữ email lấy từ `ticketData.locale` — TỨC LÀ `Booking.locale`, đã
// chụp lại `User.preferred_language` tại ĐÚNG thời điểm đặt vé (xem C7),
// KHÔNG đọc lại `User.preferred_language` hiện tại của user lúc gửi email —
// tránh trường hợp khách đổi ngôn ngữ ưa thích SAU KHI đặt vé làm sai lệch
// ngôn ngữ của email đã "chốt" tại thời điểm đặt.

const nodemailer = require("nodemailer");
const { toVN } = require("./timezone");

// BUG BẢO MẬT ĐÃ SỬA (HTML injection qua email): file này tự ghép chuỗi HTML
// bằng template string thô, KHÔNG qua React (JSX tự escape mặc định khi
// render {value} — nhưng chuỗi HTML dựng tay ở đây thì không). Trước khi sửa,
// `passenger.full_name` (khách tự gõ ở C4, models/Booking.js chỉ có
// `required: true`, KHÔNG có regex chặn ký tự đặc biệt) bị chèn thẳng vào
// HTML — khách có thể đặt full_name kiểu `<img src=x onerror=...>` và đoạn
// đó được gửi nguyên trong email vé. Mọi giá trị không cố định (full_name,
// flight_number, origin_code/dest_code, booking_code — dù 2 cái sau là dữ
// liệu do admin/server tạo, rủi ro thấp hơn nhưng escape đồng loạt cho chắc,
// không cần tự phân loại "cái nào nguy hiểm hơn") đều phải qua escapeHtml()
// trước khi nối vào template string.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Lazy-init transporter — chỉ tạo 1 lần, tái dùng cho mọi lần gửi (tránh mở
// lại kết nối SMTP mới mỗi lần gửi 1 email).
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
  vi: (code) => `Vé điện tử của bạn — Mã đặt chỗ ${code}`,
  en: (code) => `Your e-ticket — Booking code ${code}`,
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

function formatPassengerRow(passenger) {
  const seatList = passenger.seats.map((s) => escapeHtml(s.seat_number)).join(", ");
  return `<li>${escapeHtml(passenger.full_name)} — ghế ${seatList}</li>`;
}

/** Build nội dung HTML email vé điện tử từ ticketData (services/ticketService.js). */
function buildEmailHtml(ticketData) {
  const { locale, booking_code, legs, passengers, total_amount } = ticketData;
  const isEn = locale === "en";

  const legsHtml = legs.map((leg) => formatLegRow(leg, locale)).join("");
  const passengersHtml = passengers.map(formatPassengerRow).join("");
  const totalFormatted = total_amount.toLocaleString("vi-VN") + "đ";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>${isEn ? "Your e-ticket" : "Vé điện tử của bạn"} — ${escapeHtml(booking_code)}</h2>
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

/**
 * Gửi email vé điện tử tới 1 địa chỉ.
 *
 * @param {Object} params
 * @param {String} params.to - email người nhận (User.email)
 * @param {Object} params.ticketData - kết quả từ ticketService.buildTicketData()
 */
async function sendTicketEmail({ to, ticketData }) {
  const subjectFn = SUBJECT_BY_LOCALE[ticketData.locale] || SUBJECT_BY_LOCALE.vi;
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: subjectFn(ticketData.booking_code),
    html: buildEmailHtml(ticketData),
  });
}

module.exports = { sendTicketEmail, buildEmailHtml };