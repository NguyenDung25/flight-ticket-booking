const { toVN } = require("./timezone");

// [điểm đi, điểm đến] — chọn theo các sân bay có trong scripts/seedAirports.js.
const POPULAR_ROUTES = [
  ["SGN", "HAN"],
  ["HAN", "SGN"],
  ["SGN", "DAD"],
  ["HAN", "DAD"],
  ["SGN", "PQC"],
  ["HAN", "PQC"],
  ["DAD", "PQC"],
  ["CXR", "PQC"],
  ["SGN", "DLI"],
  ["SGN", "HUI"],
  ["HAN", "CXR"],
  ["HPH", "SGN"],
];

const CITY = {
  HAN: { vi: "Hà Nội", en: "Hanoi" },
  SGN: { vi: "TP. Hồ Chí Minh", en: "Ho Chi Minh City" },
  DAD: { vi: "Đà Nẵng", en: "Da Nang" },
  PQC: { vi: "Phú Quốc", en: "Phu Quoc" },
  CXR: { vi: "Nha Trang", en: "Nha Trang" },
  DLI: { vi: "Đà Lạt", en: "Da Lat" },
  HUI: { vi: "Huế", en: "Hue" },
  HPH: { vi: "Hải Phòng", en: "Hai Phong" },
};

// Hình minh họa vẽ bằng SVG theo điểm đến (components/home/RouteArt.jsx).
const DEST_ART = {
  HAN: { motif: "pagoda", sky: ["#8fd3a8", "#f4d58a", "#f08a46"] },
  SGN: { motif: "skyline", sky: ["#5cc8ee", "#f6d56a", "#f08a46"] },
  DAD: { motif: "bridge", sky: ["#e8b8e4", "#f7c9d8", "#f6a98f"] },
  PQC: { motif: "beach", sky: ["#4cb5d8", "#f8c36b", "#ee7a3a"] },
  CXR: { motif: "beach", sky: ["#3fa7c9", "#a9e0e6", "#f5d28a"] },
  DLI: { motif: "hills", sky: ["#b8d8c4", "#e5ecc4", "#f3c27a"] },
  HUI: { motif: "pagoda", sky: ["#a58be0", "#f2a6b4", "#f6b36a"] },
  HPH: { motif: "skyline", sky: ["#6fb4d8", "#c9d9e8", "#f2c78a"] },
};
const DEFAULT_ART = { motif: "hills", sky: ["#f6a165", "#f08a46", "#cf4c0a"] };

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "webp", "png"];

function routeKey(origin, dest) {
  return `${origin}-${dest}`;
}

function cityName(code, locale) {
  const c = CITY[code];
  return c ? c[locale === "en" ? "en" : "vi"] : code;
}

/** 888181 -> "888.181 VND" (vi) / "VND 888,181" (en). Không có giá -> null. */
function formatPrice(vnd, locale) {
  if (vnd == null || !Number.isFinite(vnd)) return null;
  const n = new Intl.NumberFormat(locale === "en" ? "en-US" : "vi-VN").format(Math.round(vnd));
  return locale === "en" ? `VND ${n}` : `${n} VND`;
}

/** Chuẩn hóa 1 tuyến về { origin, dest, id, hasImage, imageVersion } — nhận [điểm đi, điểm đến] hoặc bản ghi từ DB. */
function normalizeRoute(r) {
  if (Array.isArray(r)) return { origin: r[0], dest: r[1], id: null, hasImage: false, imageVersion: null };
  return {
    origin: r.origin_code,
    dest: r.dest_code,
    id: r.id ?? null,
    hasImage: !!r.has_image && !!r.id,
    imageVersion: r.image_version ?? null,
  };
}

function buildRouteCards({ stats, locale, todayStr, routes = POPULAR_ROUTES }) {
  const get = (k) => (stats instanceof Map ? stats.get(k) : stats?.[k]);
  return routes.map(normalizeRoute).map((r, i, all) => {
    const s = get(routeKey(r.origin, r.dest));
    const next = s?.nextDeparture ? toVN(s.nextDeparture) : null;
    const searchDate = next ? next.format("YYYY-MM-DD") : todayStr;
    return {
      key: routeKey(r.origin, r.dest),
      from: r.origin,
      to: r.dest,
      fromCity: cityName(r.origin, locale),
      toCity: cityName(r.dest, locale),
      price: s?.minPrice ?? null,
      priceText: formatPrice(s?.minPrice, locale),
      nextTime: next ? next.format("HH:mm DD/MM") : null,
      hasFlights: !!s,
      // "Mua ngay" dẫn thẳng tới ngày có chuyến gần nhất (không phải hôm nay) để khách thấy kết quả ngay.
      href: `/search?origin=${r.origin}&destination=${r.dest}&departureDate=${searchDate}&tripType=one_way&passengerCount=1`,
      art: DEST_ART[r.dest] || DEFAULT_ART,
      // Ảnh admin tải lên (lưu trong MongoDB); null -> page.js thử ảnh trong public/images/routes rồi hình SVG.
      dbImageUrl: r.hasImage ? `/api/popular-routes/${r.id}/image?v=${r.imageVersion ?? 0}` : null,
      index: i + 1,
      total: all.length,
    };
  });
}

/** Ảnh điểm đến do người dùng tự thêm vào public/images/routes/<mã>.jpg|jpeg|webp|png. */
function resolveRouteImage(destCode, exists) {
  const base = String(destCode).toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    const rel = `images/routes/${base}.${ext}`;
    if (exists(rel)) return `/${rel}`;
  }
  return null;
}

module.exports = { POPULAR_ROUTES, CITY, DEST_ART, routeKey, cityName, formatPrice, buildRouteCards, resolveRouteImage };
