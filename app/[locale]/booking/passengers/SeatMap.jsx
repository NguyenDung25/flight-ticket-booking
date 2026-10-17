"use client";

function parseSeatNumber(seatNumber) {
  const match = /^(\d+)([A-Za-z]+)$/.exec(seatNumber);
  if (!match) return { row: seatNumber, letter: "" };
  return { row: Number(match[1]), letter: match[2] };
}

const STATUS_CLASSES = {
  available: "border-sand-200 bg-white text-ink hover:border-sea-500 cursor-pointer",
  selected: "border-coral-500 bg-coral-500 text-white cursor-pointer",
  mineUnassigned: "border-coral-300 bg-coral-50 text-coral-700 cursor-pointer",
  takenByOtherPassenger: "border-sand-200 bg-sand-100 text-ink/40 cursor-not-allowed",
  heldByOther: "border-sand-200 bg-sand-100 text-ink/30 cursor-not-allowed",
  booked: "border-sand-200 bg-sand-200 text-ink/30 cursor-not-allowed line-through",
};

export default function SeatMap({ seats, onSelect, disabled, legendT }) {
  const rows = {};
  for (const seat of seats) {
    const { row } = parseSeatNumber(seat.seat_number);
    if (!rows[row]) rows[row] = [];
    rows[row].push(seat);
  }
  const gridCols = Math.max(0, ...Object.values(rows).map((r) => r.length));
  const rowNumbers = Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3 text-xs text-ink/60">
        <LegendDot className="border-sand-200 bg-white" label={legendT("seatStatusAvailable")} />
        <LegendDot className="border-coral-500 bg-coral-500" label={legendT("seatStatusYours")} />
        <LegendDot className="border-sand-200 bg-sand-100" label={legendT("seatStatusHeld")} />
        <LegendDot className="border-sand-200 bg-sand-200" label={legendT("seatStatusBooked")} />
        <LegendDot className="border-sand-200 bg-white ring-1 ring-sea-500/40" label={legendT("seatStatusBusinessClass")} />
      </div>

      <div className="overflow-x-auto">
      <div className="flex flex-col gap-1.5 min-w-max">
        {rowNumbers.map((row) => {
          // Lưới cột = số ghế của hàng dài nhất (thường là economy).
          const rowSeats = [...rows[row]].sort((a, b) => a.seat_number.localeCompare(b.seat_number));
          const offset = Math.floor((gridCols - rowSeats.length) / 2);
          const aisleAt = gridCols >= 4 ? Math.ceil(gridCols / 2) : -1;
          const cells = [];
          for (let c = 0; c < gridCols; c++) {
            if (c === aisleAt) cells.push(<span key={`aisle-${c}`} className="w-6 shrink-0" aria-hidden="true" />);
            const seat = rowSeats[c - offset];
            if (!seat) {
              cells.push(<span key={`gap-${c}`} className="h-8 w-8 shrink-0" aria-hidden="true" />);
              continue;
            }
            const clickable =
              !disabled &&
              (seat.localStatus === "available" ||
                seat.localStatus === "selected" ||
                seat.localStatus === "mineUnassigned");
            cells.push(
              <button
                key={seat.seat_number}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSelect(seat.seat_number)}
                title={`${seat.seat_number} · ${seat.seat_class}`}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
                  STATUS_CLASSES[seat.localStatus] ?? STATUS_CLASSES.available
                } ${seat.seat_class === "business" ? "ring-1 ring-sea-500/40" : ""}`}
              >
                {parseSeatNumber(seat.seat_number).letter}
              </button>
            );
          }
          return (
            <div key={row} className="flex items-center gap-1.5">
              <span className="w-6 shrink-0 text-right text-xs text-ink/40">{row}</span>
              {cells}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function LegendDot({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm border ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
