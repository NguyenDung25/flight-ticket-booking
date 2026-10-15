// lib/popularRoutes.js
//
// Dữ liệu + hàm THUẦN cho khối "Tuyến bay phổ biến" ở trang chủ (carousel thẻ có ảnh điểm đến):
// danh sách tuyến được chọn sẵn, tên thành phố 2 ngôn ngữ, màu/hình minh họa dự phòng, và
// buildRouteCards() gộp số liệu thật (giá thấp nhất, chuyến gần nhất — do services/routeStatsService.js
// lấy từ MongoDB) thành các thẻ để hiển thị. KHÔNG đụng DB/React để test được.
// POPULAR_ROUTES chỉ là danh sách MẶC ĐỊNH: khi admin đã tùy chỉnh (models/PopularRoute.js) trang chủ dùng
// danh sách trong DB.
//
// Giá "Từ ..." là giá hạng phổ thông thấp nhất trong các chuyến `scheduled` chưa khởi hành của đúng
// tuyến đó — số thật, không phải số trang trí. Tuyến chưa có chuyến vẫn hiện (không có giá, ghi rõ).

const { toVN } = require("./timezone");

// [điểm đi, điểm đến] — chọn theo các sân bay có trong scripts/seedAirports.js. Thứ tự này là thứ tự
// ưu tiên khi nhiều tuyến cùng có/không có chuyến.
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

// Hình minh họa vẽ bằng SVG theo ĐIỂM ĐẾN (components/home/RouteArt.jsx) — dùng khi chưa có ảnh thật
// trong public/images/routes/<mã điểm đến viết thường>.jpg. sky = [trên, giữa, chân trời].
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

/**
 * @param {object} p
 * @param {Map<string,{minPrice:number,nextDeparture:Date,flights:number}>|Record<string,any>} p.stats key "SGN-HAN"
 * @param {"vi"|"en"} p.locale
 * @param {string} p.todayStr "YYYY-MM-DD" theo giờ VN — ngày dự phòng cho link khi tuyến chưa có chuyến
 * @param {Array<[string,string]|{origin_code:string,dest_code:string,id?:string,has_image?:boolean,image_version?:number}>} [p.routes]
 * @returns {Array} thẻ ĐÚNG THỨ TỰ routes (admin tự sắp xếp/ẩn tuyến ở Admin → Chuyến bay → Tuyến phổ biến)
 */
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
      // "Mua ngay" dẫn thẳng tới NGÀY có chuyến gần nhất (không phải hôm nay) để khách thấy kết quả ngay.
      href: `/search?origin=${r.origin}&destination=${r.dest}&departureDate=${searchDate}&tripType=one_way&passengerCount=1`,
      art: DEST_ART[r.dest] || DEFAULT_ART,
      // Ảnh admin tải lên (lưu trong MongoDB); null -> page.js thử ảnh trong public/images/routes rồi hình SVG.
      dbImageUrl: r.hasImage ? `/api/popular-routes/${r.id}/image?v=${r.imageVersion ?? 0}` : null,
      index: i + 1,
      total: all.length,
    };
  });
}

/**
 * Ảnh điểm đến do người dùng tự thêm vào public/images/routes/<mã>.jpg|jpeg|webp|png (mã điểm đến, chữ
 * thường, VD pqc.jpg). Trả về đường dẫn web hoặc null nếu chưa có — khi đó thẻ dùng hình SVG dự phòng.
 * @param {string} destCode
 * @param {(relPath:string)=>boolean} exists kiểm tra file tồn tại (truyền vào để test được)
 */
function resolveRouteImage(destCode, exists) {
  const base = String(destCode).toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    const rel = `images/routes/${base}.${ext}`;
    if (exists(rel)) return `/${rel}`;
  }
  return null;
}

module.exports = { POPULAR_ROUTES, CITY, DEST_ART, routeKey, cityName, formatPrice, buildRouteCards, resolveRouteImage };
