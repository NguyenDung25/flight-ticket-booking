// components/home/RouteArt.jsx
//
// Hình minh họa SVG (nền trời gradient + hình khối đặc trưng) cho thẻ tuyến bay — hiển thị khi chưa có ảnh
// thật của điểm đến trong public/images/routes/. Thuần trang trí (aria-hidden); không dùng hook nên import
// được cả từ Server lẫn Client component.

function Motif({ motif }) {
  switch (motif) {
    case "skyline":
      return (
        <g>
          <g fill="#2b1a3a" opacity="0.88">
            <rect x="0" y="390" width="42" height="130" />
            <rect x="42" y="352" width="34" height="168" />
            <rect x="76" y="404" width="48" height="116" />
            <path d="M146 520L154 150L160 40L166 150L174 520Z" />
            <rect x="196" y="366" width="40" height="154" />
            <rect x="236" y="330" width="34" height="190" />
            <rect x="270" y="394" width="50" height="126" />
          </g>
          <g fill="#ffd27a" opacity="0.75">
            <rect x="52" y="372" width="5" height="7" />
            <rect x="60" y="392" width="5" height="7" />
            <rect x="206" y="386" width="5" height="7" />
            <rect x="246" y="352" width="5" height="7" />
            <rect x="248" y="380" width="5" height="7" />
            <rect x="154" y="260" width="5" height="9" />
          </g>
        </g>
      );
    case "pagoda":
      return (
        <g>
          <circle cx="62" cy="300" r="74" fill="#2f7d4f" opacity="0.85" />
          <circle cx="266" cy="282" r="84" fill="#2a6f48" opacity="0.85" />
          <path d="M0 478Q160 384 320 478V520H0Z" fill="#b6281f" />
          <path d="M0 478Q160 384 320 478" stroke="#7d1812" strokeWidth="8" fill="none" />
          <path d="M28 458V496M72 438V496M116 424V496M160 420V496M204 424V496M248 438V496M292 458V496" stroke="#7d1812" strokeWidth="5" />
        </g>
      );
    case "bridge":
      return (
        <g>
          <g fill="#5a4b63" opacity="0.92">
            <rect x="148" y="214" width="38" height="320" rx="19" />
            <rect x="188" y="150" width="42" height="380" rx="21" />
            <rect x="232" y="196" width="38" height="334" rx="19" />
            <rect x="272" y="270" width="34" height="260" rx="17" />
            <rect x="34" y="340" width="30" height="190" rx="15" />
            <rect x="68" y="304" width="34" height="226" rx="17" />
          </g>
          <path d="M0 470H320" stroke="#3c3144" strokeWidth="6" />
          <path d="M16 470V520M60 470V520M104 470V520M148 470V520M192 470V520M236 470V520M280 470V520" stroke="#3c3144" strokeWidth="4" />
        </g>
      );
    case "beach":
      return (
        <g>
          <circle cx="236" cy="336" r="46" fill="#ffd27a" />
          <path d="M0 364H320V520H0Z" fill="#1f7a8c" opacity="0.88" />
          <path d="M0 444Q40 428 80 444T160 444T240 444T320 444V520H0Z" fill="#f3d9a4" />
          <path d="M70 520Q80 404 112 340" stroke="#5a3b22" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M112 340q-42-30-84-10q42-4 84 10zM112 340q30-42 82-30q-46 8-82 30zM112 340q-10-46 22-72q-2 42-22 72z" fill="#2f7d4f" />
        </g>
      );
    default:
      return (
        <g>
          <path d="M0 404L70 304L130 382L200 272L260 362L320 304V520H0Z" fill="#3b6b57" opacity="0.92" />
          <path d="M0 462L90 372L170 452L250 362L320 432V520H0Z" fill="#2a5444" />
          <path d="M40 470l12-34l12 34zM120 480l10-30l10 30zM232 472l12-36l12 36z" fill="#1d3b30" />
        </g>
      );
  }
}

export default function RouteArt({ motif, sky, id }) {
  const [top, mid, low] = sky;
  return (
    <svg
      viewBox="0 0 320 520"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={low} />
        </linearGradient>
      </defs>
      <rect width="320" height="520" fill={`url(#sky-${id})`} />
      <Motif motif={motif} />
    </svg>
  );
}
