function legOf(booking, leg) {
  return (booking.flights || []).find((f) => f.leg === leg) || null;
}

// flight_id chỉ là object khi đã populate; nếu chỉ là chuỗi ObjectId thì coi như không có thông tin chuyến.
function flightDoc(legEntry) {
  const f = legEntry && legEntry.flight_id;
  return f && typeof f === "object" ? f : null;
}

function getRefundNote(booking) {
  if (!booking || booking.status !== "refunded" || booking.refund_amount == null) return null;

  const fee = booking.cancellation_fee_amount ?? 0;
  const tier = booking.cancellation_tier;
  const outbound = legOf(booking, "outbound");
  const ret = legOf(booking, "return");
  const isRoundTrip = booking.trip_type === "round_trip" && !!outbound && !!ret;

  // A8 — hãng hủy: có chuyến trong booking đã ở trạng thái `cancelled`.
  const airlineCancelled = (booking.flights || []).some((l) => flightDoc(l)?.status === "cancelled");
  if (airlineCancelled) {
    return tier === "partial"
      ? { key: "refundNoteAirlinePartial", fee }
      : { key: "refundNoteAirlineFull", fee: null };
  }

  // Khứ hồi: chặng đi đã bay chưa lúc xử lý hoàn tiền? (refund_processed_at so với giờ bay chặng đi)
  let outboundFlown = false;
  if (isRoundTrip) {
    const dep = flightDoc(outbound)?.departure_time;
    const processedAt = booking.refund_processed_at;
    if (dep && processedAt) {
      outboundFlown = new Date(processedAt).getTime() >= new Date(dep).getTime();
    } else {
      // Thiếu dữ liệu chuyến: dựa vào tier — TH2 luôn là "partial".
      outboundFlown = tier === "partial";
    }
  }

  if (isRoundTrip && outboundFlown) {
    const returnAmount = ret.amount ?? 0;
    if (fee === 0) return { key: "refundNoteReturnFull", fee: null };
    if (returnAmount > 0 && fee >= returnAmount) return { key: "refundNoteReturnNone", fee: null };
    return { key: "refundNoteReturnFixedFee", fee };
  }

  const prefix = isRoundTrip ? "refundNoteOutbound" : "refundNoteOneWay";
  if (tier === "none") return { key: `${prefix}None`, fee: null };
  if (tier === "fixed_fee" || fee > 0) return { key: `${prefix}FixedFee`, fee };
  return { key: `${prefix}Full`, fee: null };
}

module.exports = { getRefundNote };
