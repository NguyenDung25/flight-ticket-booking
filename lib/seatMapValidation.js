// lib/seatMapValidation.js
//
// Validate Aircraft.seat_map_template ở cả POST (tạo) và PUT/PATCH (sửa): trước đây chỉ phần sửa kiểm
// tra, tạo mới thì không — template có số ghế trùng hoặc sai định dạng sẽ sinh ra Flight.seats[] mà
// hold-seat không thao tác được (SEAT_NUMBER_RE) hoặc trùng ghế. Ném lỗi có statusCode 400.
const { SEAT_NUMBER_RE } = require("../services/seatService");

const { MAX_TOTAL_SEATS } = require("./seatLayout");

const SEAT_CLASSES = ["economy", "business"];

function fail(message) {
  const err = new Error(message);
  err.statusCode = 400;
  throw err;
}

function assertValidSeatMapTemplate(seatMap) {
  if (!Array.isArray(seatMap) || seatMap.length === 0) fail("seat_map_template phải là mảng có ít nhất 1 ghế.");
  if (seatMap.length > MAX_TOTAL_SEATS) fail(`seat_map_template tối đa ${MAX_TOTAL_SEATS} ghế.`);
  const seen = new Set();
  for (const seat of seatMap) {
    const num = typeof seat?.seat_number === "string" ? seat.seat_number.trim() : "";
    if (!num) fail("Mọi ghế trong seat_map_template phải có seat_number.");
    if (!SEAT_NUMBER_RE.test(num)) {
      fail(`Số ghế "${num}" không hợp lệ (chỉ gồm chữ/số/gạch, tối đa 8 ký tự, VD 1A, 12C).`);
    }
    if (!SEAT_CLASSES.includes(seat.seat_class)) {
      fail(`Ghế ${num} có seat_class không hợp lệ (chỉ nhận: ${SEAT_CLASSES.join(", ")}).`);
    }
    if (seen.has(num)) fail(`Số ghế ${num} bị trùng trong seat_map_template.`);
    seen.add(num);
  }
}

module.exports = { assertValidSeatMapTemplate };
