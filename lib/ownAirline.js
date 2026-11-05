const { OWN_AIRLINE_CODE } = require("../config/constants");

/** Các bước pipeline giữ lại chỉ chuyến bay của hãng sở hữu website (website là kênh bán vé của một hãng). */
const ownAirlineStages = () => [
  { $lookup: { from: "airlines", localField: "airline_id", foreignField: "_id", as: "own_airline" } },
  { $match: { "own_airline.code": OWN_AIRLINE_CODE } },
];

module.exports = { OWN_AIRLINE_CODE, ownAirlineStages };
