// services/seatService.js
//
// Toàn bộ thao tác đọc/ghi Flight.seats[] tập trung ở đây — KHÔNG viết
// updateOne/updateMany rải rác ở route hay service khác, để mọi chỗ đều đi
// qua đúng 1 nơi xử lý các bẫy race-condition đã ghi chú trong thiết kế.
//
// Nguyên tắc chung: mọi thay đổi status ghế đều là 1 update ATOMIC có điều
// kiện trạng thái hiện tại trong query (KHÔNG đọc rồi ghi 2 bước riêng), vì hệ
// thống cố tình không dùng MongoDB Transaction (mục 10).

const crypto = require("crypto");
const Flight = require("../models/Flight");
const { isCheckInWindowOpen } = require("../lib/timezone");
const { SEAT_HOLD_DURATION_MS, BOARDING_PASS_CODE_LENGTH } = require("../config/constants");

class SeatConflictError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 409; // Conflict — dùng để API route trả đúng mã lỗi
  }
}

// Bỏ ký tự dễ đọc/gõ nhầm khi soát vé tại cổng: I/1, O/0.
const BOARDING_PASS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBoardingPassCode() {
  let code = "";
  for (let i = 0; i < BOARDING_PASS_CODE_LENGTH; i++) {
    code += BOARDING_PASS_ALPHABET[crypto.randomInt(BOARDING_PASS_ALPHABET.length)];
  }
  return code;
}

/**
 * C5 — hold-seat: giữ 1 ghế trong 30 phút, chỉ thành công nếu ghế đang
 * `available`. Atomic bằng điều kiện `status: available` ngay trong query.
 *
 * @returns {Promise<Object>} Flight doc sau update
 * @throws {SeatConflictError} nếu ghế không tồn tại hoặc không còn available
 *   (đã bị người khác giữ/đặt trước — client cần load lại sơ đồ ghế)
 */
async function holdSeat({ flightId, seatNumber, userId }) {
  const updated = await Flight.findOneAndUpdate(
    { _id: flightId, "seats.seat_number": seatNumber, "seats.status": "available" },
    {
      $set: {
        "seats.$.status": "held",
        "seats.$.held_by": userId,
        "seats.$.held_until": new Date(Date.now() + SEAT_HOLD_DURATION_MS),
      },
    },
    { new: true }
  );

  if (!updated) {
    throw new SeatConflictError(
      `Ghế ${seatNumber} không còn trống — vui lòng chọn ghế khác.`
    );
  }
  return updated;
}

/**
 * C5 — release-seat: nhả ghế đang held. Gọi khi khách bỏ chọn ghế, hoặc xóa
 * hành khách đã lỡ chọn ghế (C4, side-effect bắt buộc), hoặc khi Momo báo
 * `failed` trước hết 30 phút (C6).
 *
 * `userId` là bắt buộc và phải khớp `held_by` hiện tại — chặn trường hợp 1
 * user cố tình gọi API nhả ghế đang được người KHÁC giữ hợp lệ (ghế của mình
 * đã hết hạn/không tồn tại thì coi như no-op, không phải lỗi, vì mục tiêu
 * cuối cùng — ghế không còn "held bởi user đó" — đã đạt được).
 *
 * @returns {Promise<Object|null>} Flight doc sau update, hoặc null nếu
 *   không có gì để nhả (ghế không held bởi đúng user này — no-op, KHÔNG ném lỗi)
 */
async function releaseSeat({ flightId, seatNumber, userId }) {
  const updated = await Flight.findOneAndUpdate(
    {
      _id: flightId,
      "seats.seat_number": seatNumber,
      "seats.status": "held",
      "seats.held_by": userId,
    },
    {
      $set: {
        "seats.$.status": "available",
        "seats.$.held_by": null,
        "seats.$.held_until": null,
      },
    },
    { new: true }
  );
  return updated; // null là hợp lệ ở đây — xem giải thích JSDoc phía trên
}

/**
 * C6 — chuyển ghế `held → booked` khi webhook Momo báo thanh toán thành
 * công. Gọi 1 lần cho MỖI (flight_id, seat_number) trong
 * Booking.passengers[].seats[] — KHÔNG gộp thành updateMany vì cần biết
 * chính xác ghế nào thất bại để quyết định `payment_error_manual_refund`.
 *
 * @returns {Promise<boolean>} true nếu ghế này chuyển thành công
 */
async function confirmSeatBooked({ flightId, seatNumber, userId }) {
  const result = await Flight.updateOne(
    {
      _id: flightId,
      "seats.seat_number": seatNumber,
      "seats.status": "held",
      "seats.held_by": userId,
    },
    { $set: { "seats.$.status": "booked" } }
  );
  return result.modifiedCount === 1;
}

/**
 * C6 — xác nhận TOÀN BỘ ghế của 1 booking khi Momo báo thành công.
 *
 * QUAN TRỌNG (ghi chú y): nếu bất kỳ ghế nào trong danh sách thất bại (đã bị
 * cron nhả do quá hạn, hoặc bị người khác giữ/đặt trước), hàm KHÔNG tự rollback
 * các ghế đã confirm thành công trước đó — vì tiền đã bị trừ thật qua Momo,
 * rollback (nhả lại ghế đã booked) sẽ mất dấu vé mà khách đã trả tiền. Thay
 * vào đó, trả về danh sách ghế thất bại để route gọi hàm này set
 * `Booking.status = 'payment_error_manual_refund'` (KHÔNG set 'confirmed'),
 * và xử lý hoàn tiền thủ công qua A7 — không được coi đây là lỗi để retry.
 *
 * @param {Array<{flightId: String, seatNumber: String}>} seatRefs
 * @returns {Promise<{ allSucceeded: boolean, failedSeats: Array }>}
 */
async function confirmAllSeatsBooked({ seatRefs, userId }) {
  const failedSeats = [];
  for (const { flightId, seatNumber } of seatRefs) {
    const ok = await confirmSeatBooked({ flightId, seatNumber, userId });
    if (!ok) failedSeats.push({ flightId, seatNumber });
  }
  return { allSucceeded: failedSeats.length === 0, failedSeats };
}

/**
 * Cron job (Giai đoạn 6) — quét TOÀN BỘ collection Flight, nhả mọi ghế
 * `held` đã quá `held_until`. Chạy định kỳ (VD mỗi 1 phút) từ 1 tiến trình
 * riêng (xem README — node-cron hoặc scheduler tương đương), KHÔNG phải từ
 * 1 request API thông thường.
 *
 * BẮT BUỘC dùng `arrayFilters`, không dùng toán tử vị trí `$` đơn thuần —
 * `$` chỉ cập nhật ĐÚNG 1 phần tử đầu tiên khớp điều kiện trong seats[] của
 * MỖI document. Nếu 1 Flight có nhiều ghế held quá hạn cùng lúc (VD 1 khách
 * giữ 3 ghế cho cả gia đình rồi bỏ ngang), dùng "seats.$.status" sẽ CHỈ nhả
 * được 1 trong 3 ghế, 2 ghế còn lại bị bỏ sót mãi ở trạng thái "held".
 *
 * @returns {Promise<{ flightsMatched: Number, flightsModified: Number }>}
 */
async function releaseExpiredHolds() {
  const result = await Flight.updateMany(
    { "seats.status": "held", "seats.held_until": { $lt: new Date() } },
    {
      $set: {
        "seats.$[elem].status": "available",
        "seats.$[elem].held_by": null,
        "seats.$[elem].held_until": null,
      },
    },
    {
      arrayFilters: [{ "elem.status": "held", "elem.held_until": { $lt: new Date() } }],
    }
  );

  return { flightsMatched: result.matchedCount, flightsModified: result.modifiedCount };
}

/**
 * A7/C9 (hủy vé đã thanh toán) và A8 (hủy hàng loạt khi chuyến bay bị hủy) —
 * nhả 1 ghế đang `booked` (hoặc `held` nếu vô tình còn sót) về `available`,
 * KHÔNG cần khớp `held_by` như `releaseSeat` (vì đây là hành động hệ thống/
 * admin thực hiện thay, không phải chính khách bấm bỏ chọn ghế).
 *
 * Luôn reset `checked_in`/`checked_in_at`/`boarding_pass_code` về mặc định —
 * an toàn cho cả 2 trường hợp gọi:
 * - A7/C9: ghế chắc chắn `checked_in: false` (vì bị chặn hủy nếu đã check-in,
 *   ghi chú l), reset lại cũng không ảnh hưởng gì.
 * - A8: ghế CÓ THỂ đã `checked_in: true` (A8 bỏ qua rào cản check-in), bắt
 *   buộc phải reset field này theo đúng yêu cầu của A8.
 *
 * @returns {Promise<boolean>} true nếu có ghế được nhả (false nếu ghế đã
 *   `available` sẵn từ trước — coi là no-op, không phải lỗi)
 */
async function forceReleaseSeat({ flightId, seatNumber }) {
  const result = await Flight.updateOne(
    {
      _id: flightId,
      "seats.seat_number": seatNumber,
      "seats.status": { $in: ["held", "booked"] },
    },
    {
      $set: {
        "seats.$.status": "available",
        "seats.$.held_by": null,
        "seats.$.held_until": null,
        "seats.$.checked_in": false,
        "seats.$.checked_in_at": null,
        "seats.$.boarding_pass_code": null,
      },
    }
  );
  return result.modifiedCount === 1;
}

/**
 * C10 — check-in online cho 1 ghế đã đặt. Chỉ cho phép trong khung
 * [departure_time - 24h, departure_time - 2h] (`isCheckInWindowOpen`,
 * lib/timezone.js — TÁI DÙNG nguyên hàm đó, KHÔNG tự so sánh giờ lại ở đây
 * để tránh lệch logic giữa 2 nơi nếu sau này đổi mốc 24h/2h).
 *
 * `userId` bắt buộc khớp `held_by` hiện tại của ghế — `held_by` KHÔNG bị xóa
 * khi ghế chuyển `booked` (xem `confirmSeatBooked` ở trên), nên vẫn dùng
 * được để xác định đúng chủ ghế mà không cần join sang `Booking` chỉ để biết
 * ai được phép check-in ghế này (việc join sang `Booking` để lấy `locale`
 * hiển thị boarding pass là việc của `services/checkinService.js`, KHÔNG
 * phải của hàm này).
 *
 * Atomic: điều kiện `status: 'booked'`, `held_by: userId`, `checked_in: false`
 * ngay trong 1 query — chặn double check-in nếu user bấm nút 2 lần liên tiếp
 * (2 request gần như đồng thời).
 *
 * @returns {Promise<{ boardingPassCode: String, checkedInAt: Date }>}
 * @throws {SeatConflictError} 409 nếu chuyến bay không tồn tại, ngoài khung
 *   giờ cho phép, ghế không thuộc user này, chưa `booked`, hoặc đã check-in rồi
 */
async function checkInSeat({ flightId, seatNumber, userId }) {
  const flight = await Flight.findById(flightId);
  if (!flight) {
    throw new SeatConflictError("Không tìm thấy chuyến bay.");
  }
  if (!isCheckInWindowOpen(flight.departure_time)) {
    throw new SeatConflictError(
      "Chỉ được check-in trong khung từ 24 tiếng đến 2 tiếng trước giờ bay."
    );
  }

  const boardingPassCode = randomBoardingPassCode();
  const checkedInAt = new Date();

  const updated = await Flight.findOneAndUpdate(
    {
      _id: flightId,
      "seats.seat_number": seatNumber,
      "seats.status": "booked",
      "seats.held_by": userId,
      "seats.checked_in": false,
    },
    {
      $set: {
        "seats.$.checked_in": true,
        "seats.$.checked_in_at": checkedInAt,
        "seats.$.boarding_pass_code": boardingPassCode,
      },
    },
    { new: true }
  );

  if (!updated) {
    throw new SeatConflictError(
      `Ghế ${seatNumber} không hợp lệ để check-in (chưa đặt, không thuộc về bạn, hoặc đã check-in trước đó).`
    );
  }

  return { boardingPassCode, checkedInAt };
}

module.exports = {
  SeatConflictError,
  holdSeat,
  releaseSeat,
  confirmSeatBooked,
  confirmAllSeatsBooked,
  releaseExpiredHolds,
  forceReleaseSeat,
  checkInSeat,
};