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
const mongoose = require("mongoose");
const {
  SEAT_HOLD_DURATION_MS,
  BOARDING_PASS_CODE_LENGTH,
  MAX_HELD_SEATS_PER_USER,
} = require("../config/constants");

class SeatConflictError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 409; // Conflict — dùng để API route trả đúng mã lỗi
  }
}

/** seat_number từ client phải là chuỗi ngắn — chặn object toán tử ({"$ne":...}) lọt vào query. */
const SEAT_NUMBER_RE = /^[0-9A-Za-z_-]{1,8}$/;
function assertValidSeatNumber(seatNumber) {
  if (typeof seatNumber !== "string" || !SEAT_NUMBER_RE.test(seatNumber)) {
    const err = new Error("seat_number không hợp lệ.");
    err.statusCode = 400;
    throw err;
  }
}

/** Đếm ghế `held` CÒN HẠN của 1 user trên mọi chuyến (để giới hạn số ghế giữ cùng lúc). */
async function countActiveHeldSeats(userId, now = new Date()) {
  if (!mongoose.isValidObjectId(String(userId))) return 0;
  const uid = new mongoose.Types.ObjectId(String(userId));
  const rows = await Flight.aggregate([
    { $match: { seats: { $elemMatch: { status: "held", held_by: uid, held_until: { $gte: now } } } } },
    {
      $project: {
        n: {
          $size: {
            $filter: {
              input: "$seats",
              as: "s",
              cond: {
                $and: [
                  { $eq: ["$$s.status", "held"] },
                  { $eq: ["$$s.held_by", uid] },
                  { $gte: ["$$s.held_until", now] },
                ],
              },
            },
          },
        },
      },
    },
    { $group: { _id: null, total: { $sum: "$n" } } },
  ]);
  return rows[0]?.total ?? 0;
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
 * C5 — hold-seat: giữ 1 ghế trong 30 phút. Atomic bằng $elemMatch — ĐÚNG 1
 * phần tử mảng phải thỏa 1 trong 2 điều kiện: đang `available`, HOẶC đang
 * `held` bởi CHÍNH userId này rồi (idempotent — client (PassengersForm.jsx)
 * không tự đoán "ghế này chắc vẫn đang là của mình" rồi bỏ qua gọi API, mà
 * LUÔN gọi hold-seat và để server tự quyết định; xem ghi chú "BUG THẬT" bên
 * dưới để hiểu vì sao).
 *
 * $elemMatch (thay vì 2 điều kiện top-level rời + $or) là bắt buộc ở đây —
 * đảm bảo CẢ 2 vế của $or cùng áp vào MỘT phần tử mảng duy nhất, để `$`
 * trong $set phía dưới trỏ đúng phần tử đó. Viết `"seats.status"` +
 * `"seats.held_by"` rời nhau (không $elemMatch) sẽ SAI tinh vi: Mongo có
 * thể match "status đúng" ở ghế A và "held_by đúng" ở ghế B khác, `$` sẽ trỏ
 * mơ hồ/nhầm ghế.
 *
 * BUG THẬT đã sửa: code cũ ở client có nhánh "ghế này mình đã giữ từ trước
 * (mineUnassigned) -> bỏ qua gọi hold-seat lại" — dựa vào state cũ tải từ
 * trang (có thể đã hết hạn 30 phút ở server tự lúc nào không biết). Client
 * tưởng vẫn đang giữ, nhưng server đã tự nhả (cron/hết hạn) từ trước — ghế
 * "held bởi mình" trên UI thực ra KHÔNG hề được giữ thật. Fix ở CẢ 2 phía:
 * server cho phép hold lại (refresh held_until) nếu đúng là ghế của mình,
 * và client (xem PassengersForm.jsx) bỏ hẳn nhánh đoán mò đó — LUÔN gọi lại
 * hold-seat, để server làm trọng tài duy nhất, không tự suy đoán trạng thái
 * cũ trên client.
 *
 * @returns {Promise<Object>} Flight doc sau update
 * @throws {SeatConflictError} nếu ghế không tồn tại, hoặc đang held/booked
 *   bởi NGƯỜI KHÁC (không phải available, không phải của userId này)
 */
async function holdSeat({ flightId, seatNumber, userId }) {
  assertValidSeatNumber(seatNumber);
  const now = new Date();

  // Giới hạn số ghế giữ cùng lúc: gọi lại hold-seat cho ghế ĐANG giữ (gia hạn) thì không tính
  // thêm; chỉ chặn khi lấy ghế MỚI mà đã đủ hạn mức (chống 1 người chiếm cả chuyến bay).
  const active = await countActiveHeldSeats(userId, now);
  if (active >= MAX_HELD_SEATS_PER_USER) {
    const alreadyMine = await Flight.exists({
      _id: flightId,
      seats: { $elemMatch: { seat_number: seatNumber, status: "held", held_by: userId, held_until: { $gte: now } } },
    });
    if (!alreadyMine) {
      const err = new SeatConflictError(
        `Bạn đang giữ quá nhiều ghế (tối đa ${MAX_HELD_SEATS_PER_USER}). Hãy bỏ bớt ghế trước khi chọn thêm.`
      );
      err.statusCode = 429;
      throw err;
    }
  }

  const bookable = { status: "scheduled", departure_time: { $gt: now } }; // chưa hủy, chưa khởi hành

  // Chỉ chiếm ghế TRỐNG hoặc ghế `held` đã QUÁ HẠN (coi như trống ngay, không phụ thuộc cron).
  // Ghế đang được CHÍNH user này giữ còn hạn KHÔNG bị gia hạn: hold-seat gọi lại chỉ idempotent,
  // nếu không 1 người có thể giữ ghế vô thời hạn bằng cách gọi lặp lại (phá cơ chế 30 phút).
  const updated = await Flight.findOneAndUpdate(
    {
      _id: flightId,
      ...bookable,
      seats: {
        $elemMatch: {
          seat_number: seatNumber,
          $or: [{ status: "available" }, { status: "held", held_until: { $lt: now } }],
        },
      },
    },
    {
      $set: {
        "seats.$.status": "held",
        "seats.$.held_by": userId,
        "seats.$.held_until": new Date(now.getTime() + SEAT_HOLD_DURATION_MS),
      },
    },
    { returnDocument: "after" }
  );
  if (updated) return updated;

  // Không chiếm được: có phải ghế mình đang giữ còn hạn (idempotent) không?
  const mine = await Flight.findOne({
    _id: flightId,
    ...bookable,
    seats: {
      $elemMatch: { seat_number: seatNumber, status: "held", held_by: userId, held_until: { $gte: now } },
    },
  });
  if (mine) return mine;

  // Phân biệt lý do để báo đúng: chuyến không còn nhận đặt vs ghế đã có người.
  const flight = await Flight.findById(flightId).select("status departure_time").lean();
  if (flight && (flight.status !== "scheduled" || new Date(flight.departure_time) <= new Date())) {
    throw new SeatConflictError("Chuyến bay đã bị hủy hoặc đã khởi hành, không thể giữ ghế.");
  }
  throw new SeatConflictError(`Ghế ${seatNumber} không còn trống — vui lòng chọn ghế khác.`);
}

/**
 * C5 — release-seat: nhả ghế đang held. Gọi khi khách bỏ chọn ghế, hoặc xóa
 * hành khách đã lỡ chọn ghế (C4, side-effect bắt buộc), hoặc khi VNPay báo
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
  assertValidSeatNumber(seatNumber);
  const updated = await Flight.findOneAndUpdate(
    {
      _id: flightId,
      seats: {
        $elemMatch: { seat_number: seatNumber, status: "held", held_by: userId },
      },
    },
    {
      $set: {
        "seats.$.status": "available",
        "seats.$.held_by": null,
        "seats.$.held_until": null,
      },
    },
    { returnDocument: "after" }
  );
  return updated; // null là hợp lệ ở đây — xem giải thích JSDoc phía trên
}

/**
 * C6 — chuyển ghế `held → booked` khi webhook VNPay báo thanh toán thành
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
      seats: {
        $elemMatch: { seat_number: seatNumber, status: "held", held_by: userId },
      },
    },
    { $set: { "seats.$.status": "booked" } }
  );
  return result.modifiedCount === 1;
}

/**
 * C6 — xác nhận TOÀN BỘ ghế của 1 booking khi VNPay báo thành công.
 *
 * QUAN TRỌNG (ghi chú y): nếu bất kỳ ghế nào trong danh sách thất bại (đã bị
 * cron nhả do quá hạn, hoặc bị người khác giữ/đặt trước), hàm KHÔNG tự rollback
 * các ghế đã confirm thành công trước đó — vì tiền đã bị trừ thật qua VNPay,
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

/** Ghế đang `booked` bởi đúng user này? (phân biệt luồng thanh toán song song với mất ghế thật) */
async function isSeatBookedBy({ flightId, seatNumber, userId }) {
  assertValidSeatNumber(seatNumber);
  const found = await Flight.exists({
    _id: flightId,
    seats: { $elemMatch: { seat_number: seatNumber, status: "booked", held_by: userId } },
  });
  return Boolean(found);
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
 * nhả 1 ghế đang `booked` (hoặc `held` nếu vô tình còn sót) về `available`.
 *
 * BUG THẬT đã sửa: trước đây hàm này nhả ghế BẤT KỂ ai đang giữ (không truyền
 * `userId`, không khớp `held_by`). Vì `Booking.flights[].seat_number` là dữ
 * liệu TĨNH chép lúc tạo booking (không tự cập nhật nếu ghế đổi chủ), nếu 1
 * booking cũ (A) giữ ghế X hết hạn rồi bị cron nhả, booking khác (B) giữ/đặt
 * đúng ghế X đó, SAU ĐÓ một webhook/cron xử lý TRỄ cho booking A (VD IPN thất
 * bại tới muộn sau khi A đã hết hạn) gọi forceReleaseSeat cho ghế X — hàm cũ
 * sẽ nhả NHẦM đúng ghế booking B đang giữ/đã đặt, mất ghế oan cho khách B.
 *
 * Giờ BẮT BUỘC truyền `userId` (lấy từ `booking.user_id` của booking đang xử
 * lý) và khớp `held_by` — nếu ghế đã đổi chủ (held_by khác userId) thì coi
 * như no-op, ĐÚNG Ý: ghế đó không còn là của booking đang bị hủy nữa, không
 * có gì để nhả cho nó cả.
 *
 * Luôn reset `checked_in`/`checked_in_at`/`boarding_pass_code` về mặc định —
 * an toàn cho cả 2 trường hợp gọi:
 * - A7/C9: ghế chắc chắn `checked_in: false` (vì bị chặn hủy nếu đã check-in,
 *   ghi chú l), reset lại cũng không ảnh hưởng gì.
 * - A8: ghế CÓ THỂ đã `checked_in: true` (A8 bỏ qua rào cản check-in), bắt
 *   buộc phải reset field này theo đúng yêu cầu của A8.
 *
 * @returns {Promise<boolean>} true nếu có ghế được nhả (false nếu ghế đã
 *   `available` sẵn từ trước, hoặc đã đổi chủ sang booking khác — cả 2 coi
 *   là no-op, không phải lỗi)
 */
async function forceReleaseSeat({ flightId, seatNumber, userId }) {
  if (!userId) {
    // Không cho gọi thiếu userId — im lặng bỏ qua check sẽ quay lại đúng bug
    // cũ. Bắt lỗi sớm và rõ ràng tại đây thay vì để lọt xuống tận MongoDB.
    throw new Error("forceReleaseSeat: thiếu userId — bắt buộc để tránh nhả nhầm ghế người khác.");
  }
  const result = await Flight.updateOne(
    {
      _id: flightId,
      seats: {
        $elemMatch: { seat_number: seatNumber, status: { $in: ["held", "booked"] }, held_by: userId },
      },
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
 * A3 (hoàn tiền tay cho booking `payment_error_manual_refund`) — nhả 1 ghế CHỈ KHI
 * nó vẫn đang `booked` đúng bởi `userId` này. Cùng nguyên tắc khớp `held_by`
 * như `forceReleaseSeat` (xem comment hàm đó) — giữ hàm riêng ở đây vì ngữ
 * cảnh A3 CHỈ áp dụng cho status `booked` (không bao gồm `held`), và trả
 * `boolean` đơn giản thay vì phải gọi forceReleaseSeat với tham số dư thừa.
 *
 * Nếu ghế đã `available` (cron nhả từ trước) hoặc thuộc người khác thì no-op.
 *
 * @returns {Promise<boolean>} true nếu có ghế được nhả
 */
async function releaseBookedSeatOwnedBy({ flightId, seatNumber, userId }) {
  const result = await Flight.updateOne(
    {
      _id: flightId,
      seats: {
        $elemMatch: { seat_number: seatNumber, status: "booked", held_by: userId },
      },
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
  assertValidSeatNumber(seatNumber);
  const flight = await Flight.findById(flightId);
  if (!flight) {
    throw new SeatConflictError("Không tìm thấy chuyến bay.");
  }
  // Chuyến đã bị hãng hủy (A1/A8): booking có thể vẫn `confirmed` cho tới khi admin chạy hủy hàng
  // loạt, nhưng không được phát thẻ lên máy bay cho chuyến không bay.
  if (flight.status === "cancelled") {
    throw new SeatConflictError("Chuyến bay đã bị hủy, không thể check-in.");
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
      seats: {
        $elemMatch: {
          seat_number: seatNumber,
          status: "booked",
          held_by: userId,
          checked_in: false,
        },
      },
    },
    {
      $set: {
        "seats.$.checked_in": true,
        "seats.$.checked_in_at": checkedInAt,
        "seats.$.boarding_pass_code": boardingPassCode,
      },
    },
    { returnDocument: "after" }
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
  SEAT_NUMBER_RE,
  assertValidSeatNumber,
  countActiveHeldSeats,
  holdSeat,
  releaseSeat,
  confirmSeatBooked,
  confirmAllSeatsBooked,
  isSeatBookedBy,
  releaseExpiredHolds,
  forceReleaseSeat,
  releaseBookedSeatOwnedBy,
  checkInSeat,
};