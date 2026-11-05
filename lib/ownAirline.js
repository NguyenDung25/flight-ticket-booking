const { OWN_AIRLINE_CODE } = require("../config/constants");
const Airline = require("../models/Airline");

/** Các bước pipeline giữ lại chỉ chuyến bay của hãng sở hữu website (website là kênh bán vé của một hãng). */
const ownAirlineStages = () => [
  { $lookup: { from: "airlines", localField: "airline_id", foreignField: "_id", as: "own_airline" } },
  { $match: { "own_airline.code": OWN_AIRLINE_CODE } },
];

/** _id của hãng sở hữu website (null nếu chưa có trong DB). */
async function getOwnAirlineId() {
  const own = await Airline.findOne({ code: OWN_AIRLINE_CODE }).select("_id").lean();
  return own?._id ?? null;
}

/** Chuyến bay (id hãng) có thuộc hãng của website không — dùng để chặn đặt chuyến của hãng khác khi gọi thẳng bằng id. */
async function isOwnAirlineId(airlineId) {
  const ownId = await getOwnAirlineId();
  return !!ownId && String(ownId) === String(airlineId?._id ?? airlineId);
}

module.exports = { OWN_AIRLINE_CODE, ownAirlineStages, getOwnAirlineId, isOwnAirlineId };
