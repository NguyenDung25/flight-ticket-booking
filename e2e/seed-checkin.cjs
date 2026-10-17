const mongoose = require("mongoose");
const Airline = require("../models/Airline");
const Aircraft = require("../models/Aircraft");
const Flight = require("../models/Flight");
const User = require("../models/User");
const Booking = require("../models/Booking");

const E2E_BOOKING_CODE = "CKE2EA";
const E2E_SEAT = "5A";

async function main() {
  if (!/e2e/.test(process.env.MONGO_URI || "")) throw new Error("Chỉ chạy trên database E2E.");
  await mongoose.connect(process.env.MONGO_URI);
  const airline = await Airline.findOne({ code: "VN" });
  const aircraft = await Aircraft.findOne();
  const customer = await User.findOne({ email: "customer@example.com" });

  const dep = new Date(Date.now() + 10 * 3600 * 1000);
  const seats = aircraft.seat_map_template.map((s) => ({
    seat_number: s.seat_number,
    seat_class: s.seat_class,
    status: s.seat_number === E2E_SEAT ? "booked" : "available",
    held_by: s.seat_number === E2E_SEAT ? customer._id : null,
    held_until: null,
    checked_in: false,
  }));
  const flight = await Flight.create({
    flight_number: "VN910", airline_id: airline._id, aircraft_id: aircraft._id,
    origin_code: "HAN", dest_code: "SGN", departure_time: dep, arrival_time: new Date(dep.getTime() + 2 * 3600 * 1000),
    base_price: { economy: 1_000_000, business: 3_000_000 }, seats,
  });

  await Booking.create({
    booking_code: E2E_BOOKING_CODE, user_id: customer._id, trip_type: "one_way", locale: "vi",
    flights: [{ flight_id: flight._id, leg: "outbound", amount: 1_330_000, addons_amount: 330_000 }],
    passengers: [{
      full_name: "Tran Thi Checkin", document_type: "cccd", document_id: "001095012345", date_of_birth: new Date("1995-03-15"),
      seats: [{ flight_id: flight._id, seat_number: E2E_SEAT, seat_class: "economy", baggage_kg: 20, meal: true,
        addons_amount: 330_000, carry_on_kg: 7, checked_baggage_kg: 20 }],
    }],
    contact: { email: "customer@example.com", phone: "0901234567" },
    total_amount: 1_330_000, status: "confirmed",
    payment: { transaction_id: "E2E-TXN-1", paid_at: new Date() },
  });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
