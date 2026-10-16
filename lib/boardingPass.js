// lib/boardingPass.js
//
// C10 — nội dung thẻ lên máy bay, dùng CHUNG cho server (services/checkinService.js, trang
// check-in) và giao diện (app/[locale]/check-in/CheckInList.jsx). Không phụ thuộc DB/mongoose
// nên client component import được.
//
// Ngôn ngữ thẻ theo `Booking.locale` (ngôn ngữ khách dùng LÚC ĐẶT VÉ, cùng quy tắc với vé điện
// tử C7) — KHÔNG theo ngôn ngữ giao diện đang chọn: đổi giao diện sang EN không làm thẻ đã phát
// hành bằng tiếng Việt đổi theo.

const qrcode = require("qrcode-generator");
const { BOARDING_STARTS_MINUTES_BEFORE_DEPARTURE } = require("../config/constants");
const { normalizePassengerName } = require("./bookingCode");
const { toVN } = require("./timezone");

// Khuyến nghị có mặt ở sân bay trước giờ bay (chuyến nội địa) — in trong phần hướng dẫn trên thẻ.
const ARRIVE_AIRPORT_MINUTES_BEFORE = 90;

const LABELS = {
  vi: {
    boarding_pass: "Thẻ lên máy bay",
    booking_code: "Mã đặt chỗ",
    passenger: "Hành khách",
    flight: "Chuyến bay",
    from: "Từ",
    to: "Đến",
    departure: "Giờ khởi hành",
    boarding_time: "Giờ lên máy bay",
    seat: "Ghế",
    seat_class: "Hạng ghế",
    baggage: "Hành lý",
    baggage_value: (carryOn, checked) => `Xách tay ${carryOn}kg · Ký gửi ${checked}kg`,
    meal: "Suất ăn",
    economy: "Phổ thông",
    business: "Thương gia",
    boarding_pass_code: "Mã thẻ lên máy bay",
    checked_in_at: "Thời điểm check-in",
    gate_note: "Vui lòng có mặt tại cửa ra máy bay trước giờ lên máy bay. Cửa đóng trước giờ khởi hành.",
    print: "In / Lưu PDF",
    qr_alt: "Mã QR thẻ lên máy bay",
    guide_title: "Bước tiếp theo tại sân bay",
    guide_no_bag:
      "Chỉ có hành lý xách tay: đi thẳng tới cửa kiểm tra an ninh, xuất trình CCCD/hộ chiếu (hoặc VNeID) và thẻ lên máy bay này (mã QR) trên điện thoại.",
    guide_with_bag:
      'Có hành lý ký gửi: đến quầy "Gửi hành lý nhanh" (Baggage Drop / Web Check-in) của hãng để cân và gửi hành lý trước giờ đóng quầy.',
    guide_arrive: `Nên có mặt tại sân bay trước giờ khởi hành ít nhất ${ARRIVE_AIRPORT_MINUTES_BEFORE} phút.`,
  },
  en: {
    boarding_pass: "Boarding Pass",
    booking_code: "Booking code",
    passenger: "Passenger",
    flight: "Flight",
    from: "From",
    to: "To",
    departure: "Departure",
    boarding_time: "Boarding time",
    seat: "Seat",
    seat_class: "Class",
    baggage: "Baggage",
    baggage_value: (carryOn, checked) => `Carry-on ${carryOn}kg · Checked ${checked}kg`,
    meal: "Meal",
    economy: "Economy",
    business: "Business",
    boarding_pass_code: "Boarding pass code",
    checked_in_at: "Checked in at",
    gate_note: "Please be at the gate before boarding time. The gate closes before departure.",
    print: "Print / Save PDF",
    qr_alt: "Boarding pass QR code",
    guide_title: "Next steps at the airport",
    guide_no_bag:
      "Carry-on only: go straight to security and show your ID/passport (or VNeID) and this boarding pass (QR code) on your phone.",
    guide_with_bag:
      `Checked baggage: go to the airline's "Baggage Drop / Web Check-in" counter to drop your bags before the counter closes.`,
    guide_arrive: `Please arrive at the airport at least ${ARRIVE_AIRPORT_MINUTES_BEFORE} minutes before departure.`,
  },
};

/** Bộ nhãn theo ngôn ngữ booking; locale lạ/thiếu → tiếng Việt (ngôn ngữ mặc định của hệ thống). */
function boardingPassLabels(locale) {
  return LABELS[locale] || LABELS.vi;
}

/** Giờ bắt đầu lên máy bay = giờ khởi hành − BOARDING_STARTS_MINUTES_BEFORE_DEPARTURE. */
function boardingTimeFor(departureTime) {
  return new Date(new Date(departureTime).getTime() - BOARDING_STARTS_MINUTES_BEFORE_DEPARTURE * 60 * 1000);
}

/**
 * Nội dung mã QR trên thẻ lên máy bay — chuỗi ASCII ngắn, phân tách bằng "|", đủ để quầy/cửa an ninh
 * quét ra đúng hành khách và ghế: hãng|mã đặt chỗ|số hiệu chuyến|ngày bay (giờ VN)|chặng|ghế|họ tên
 * (không dấu)|mã thẻ lên máy bay.
 */
function boardingQrPayload(item) {
  return [
    "DELAYX",
    item.bookingCode,
    item.flightNumber,
    toVN(item.departureTime).format("YYYYMMDD"),
    `${item.originCode}${item.destCode}`,
    item.seatNumber,
    normalizePassengerName(item.passengerName) || "",
    item.boardingPassCode,
  ].join("|");
}

/** SVG mã QR (mức sửa lỗi M) cho thẻ lên máy bay — chỉ gồm hình vuông đen/trắng, không chứa văn bản. */
function boardingQrSvg(item) {
  const qr = qrcode(0, "M");
  qr.addData(boardingQrPayload(item));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

module.exports = { boardingPassLabels, boardingTimeFor, boardingQrPayload, boardingQrSvg };
