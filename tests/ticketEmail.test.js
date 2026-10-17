process.env.MONGO_URI ??= "mongodb://localhost:27017/test";
const test = require("node:test");
const assert = require("node:assert/strict");

const Booking = require("../models/Booking");
const Flight = require("../models/Flight");
const User = require("../models/User");
const emailClient = require("../lib/emailClient");
const { issueTicket } = require("../services/ticketService");

const patch = (obj, props) => {
  const saved = {};
  for (const k of Object.keys(props)) { saved[k] = obj[k]; obj[k] = props[k]; }
  return () => Object.assign(obj, saved);
};

function setup({ sendFails }) {
  const updates = [];
  const booking = {
    _id: "b1", user_id: "u1", status: "confirmed", booking_code: "ABC123", trip_type: "one_way",
    locale: "vi", total_amount: 1_000_000,
    flights: [{ flight_id: "f1", leg: "outbound", amount: 1_000_000 }],
    passengers: [{ full_name: "A", document_type: "cccd", document_id: "1", seats: [] }],
  };
  const restores = [
    patch(Booking, {
      findById: async () => booking,
      updateOne: async (filter, update) => { updates.push(update); return {}; },
    }),
    patch(Flight, { find: async () => [{ _id: "f1", flight_number: "TS1", origin_code: "HAN", dest_code: "SGN" }] }),
    patch(User, { findById: async () => ({ email: "a@b.c" }) }),
    patch(emailClient, {
      sendTicketEmail: async () => { if (sendFails) throw new Error('Missing credentials for "PLAIN"'); },
    }),
  ];
  return { updates, restore: () => restores.forEach((r) => r()) };
}

test("gửi lại email vé thành công → ghi ticket_emailed_at", async () => {
  const s = setup({ sendFails: false });
  try {
    const { emailSent } = await issueTicket({ bookingId: "b1", resend: true });
    assert.equal(emailSent, true);
    assert.ok(s.updates.some((u) => u.$set?.ticket_emailed_at instanceof Date));
  } finally { s.restore(); }
});

test("SMTP lỗi → emailSent false, KHÔNG ghi ticket_emailed_at, vé vẫn trả về", async () => {
  const s = setup({ sendFails: true });
  const origErr = console.error;
  console.error = () => {};
  try {
    const { emailSent, ticketData } = await issueTicket({ bookingId: "b1", resend: true });
    assert.equal(emailSent, false);
    assert.equal(ticketData.booking_code, "ABC123");
    assert.equal(s.updates.length, 0);
  } finally { console.error = origErr; s.restore(); }
});
