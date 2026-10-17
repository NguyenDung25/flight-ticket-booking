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

/** Đếm ghế `held` còn hạn của 1 user trên mọi chuyến (để giới hạn số ghế giữ cùng lúc). */
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

/** C5 — hold-seat: giữ 1 ghế trong 30 phút. */
async function holdSeat({ flightId, seatNumber, userId }) {
  assertValidSeatNumber(seatNumber);
  const now = new Date();

  // Giới hạn số ghế giữ cùng lúc: gọi lại hold-seat cho ghế đang giữ (gia hạn) thì không tính thêm.
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

  // Chỉ chiếm ghế trống hoặc ghế `held` đã quá hạn (coi như trống ngay, không phụ thuộc cron).
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

/** C5 — release-seat: nhả ghế đang held. */
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
  return updated; // null: ghế không còn do user này giữ (đã hết hạn / đã nhả) — không phải lỗi
}

/** C6 — chuyển ghế `held → booked` khi webhook VNPay báo thanh toán thành công. */
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

/** C6 — xác nhận toàn bộ ghế của 1 booking khi VNPay báo thành công. */
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

/** Cron job (Giai đoạn 6) — quét toàn bộ collection Flight, nhả mọi ghế `held` đã quá `held_until`. */
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

/** A7/C9 (hủy vé đã thanh toán) và A8 (hủy hàng loạt khi chuyến bay bị hủy) — nhả 1 ghế đang `booked`. */
async function forceReleaseSeat({ flightId, seatNumber, userId }) {
  if (!userId) {
    // Không cho gọi thiếu userId — im lặng bỏ qua check sẽ quay lại đúng bug cũ.
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

/** A3 (hoàn tiền tay cho booking `payment_error_manual_refund`). */
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

/** C10 — check-in online cho 1 ghế đã đặt. */
async function checkInSeat({ flightId, seatNumber, userId }) {
  assertValidSeatNumber(seatNumber);
  const flight = await Flight.findById(flightId);
  if (!flight) {
    throw new SeatConflictError("Không tìm thấy chuyến bay.");
  }
  // Chuyến đã bị hãng hủy (A1/A8): booking có thể vẫn `confirmed` cho tới khi admin chạy hủy hàng loạt.
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