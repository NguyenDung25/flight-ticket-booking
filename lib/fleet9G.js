// Đội tàu bay của Sun PhuQuoc Airways (9G) dùng cho dữ liệu demo. Số ghế theo cấu hình đã được công bố trên các trang bản đồ ghế
// (seatmaps.com, Trave.vn, Baydep.vn): A321 = 8 thương gia + 212 phổ thông (220 ghế); A321neo = 8 + 200 (208 ghế) hoặc 236 ghế một hạng.
// Thương gia 2 hàng x 4 ghế; phổ thông 6 ghế mỗi hàng (A–F), hàng cuối có thể thiếu ghế để đủ đúng tổng số ghế.
const FLEET = [
  { name: "Airbus A321", businessRows: 2, businessPerRow: 4, economySeats: 212 },
  { name: "Airbus A321neo", businessRows: 2, businessPerRow: 4, economySeats: 200 },
  { name: "Airbus A321neo (một hạng)", businessRows: 0, businessPerRow: 0, economySeats: 236 },
];

const LETTERS = "ABCDEFGHIJ";

function buildFleetSeatMap({ businessRows, businessPerRow, economySeats }, economyPerRow = 6) {
  const seats = [];
  for (let row = 1; row <= businessRows; row++) {
    for (let c = 0; c < businessPerRow; c++) seats.push({ seat_number: `${row}${LETTERS[c]}`, seat_class: "business" });
  }
  let row = businessRows + 1, col = 0;
  for (let i = 0; i < economySeats; i++) {
    seats.push({ seat_number: `${row}${LETTERS[col]}`, seat_class: "economy" });
    if (++col === economyPerRow) { col = 0; row++; }
  }
  return seats;
}

module.exports = { FLEET, buildFleetSeatMap };
