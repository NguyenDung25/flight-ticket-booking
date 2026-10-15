// Khối "Tuyến bay phổ biến" trang chủ: dựng thẻ từ số liệu thật, giá, ngày link, ảnh (không cần MongoDB).
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  POPULAR_ROUTES, CITY, DEST_ART, routeKey, formatPrice, buildRouteCards, resolveRouteImage,
} = require("../lib/popularRoutes");

test("danh sách tuyến: 12 tuyến khác nhau, không trùng điểm đi/đến, đủ tên thành phố và hình dự phòng", () => {
  assert.equal(POPULAR_ROUTES.length, 12);
  assert.equal(new Set(POPULAR_ROUTES.map(([o, d]) => routeKey(o, d))).size, 12);
  for (const [o, d] of POPULAR_ROUTES) {
    assert.notEqual(o, d);
    assert.ok(CITY[o] && CITY[d], `thiếu tên thành phố ${o}/${d}`);
    assert.ok(DEST_ART[d], `thiếu hình dự phòng cho điểm đến ${d}`);
  }
});

test("formatPrice: vi 888.181 VND, en VND 888,181, không có giá -> null", () => {
  assert.equal(formatPrice(888181, "vi"), "888.181 VND");
  assert.equal(formatPrice(888181, "en"), "VND 888,181");
  assert.equal(formatPrice(null, "vi"), null);
  assert.equal(formatPrice(undefined, "en"), null);
});

const stats = new Map([
  ["HAN-SGN", { minPrice: 888181, nextDeparture: new Date("2026-10-13T01:00:00.000Z"), flights: 3 }], // 08:00 13/10 giờ VN
  ["SGN-DAD", { minPrice: 666181, nextDeparture: new Date("2026-10-13T17:30:00.000Z"), flights: 1 }], // 00:30 14/10 giờ VN (qua nửa đêm)
]);

test("buildRouteCards: GIỮ ĐÚNG thứ tự danh sách (admin tự sắp xếp), index/total đúng, tuyến chưa có chuyến không có giá", () => {
  const cards = buildRouteCards({ stats, locale: "vi", todayStr: "2026-10-12" });
  assert.equal(cards.length, 12);
  assert.deepEqual(cards.map((c) => c.key), POPULAR_ROUTES.map(([o, d]) => routeKey(o, d)));
  const withFlights = cards.filter((c) => c.hasFlights).map((c) => c.key);
  assert.deepEqual(withFlights, ["HAN-SGN", "SGN-DAD"]);
  assert.ok(cards.filter((c) => !c.hasFlights).every((c) => c.price === null && c.priceText === null && c.nextTime === null));
  assert.deepEqual(cards.map((c) => c.index), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.ok(cards.every((c) => c.total === 12));
});

test("buildRouteCards: giá, giờ gần nhất theo giờ VN và link dẫn tới NGÀY có chuyến", () => {
  const cards = buildRouteCards({ stats, locale: "vi", todayStr: "2026-10-12" });
  const han = cards.find((c) => c.key === "HAN-SGN");
  const sgn = cards.find((c) => c.key === "SGN-DAD");
  const noFlights = cards.find((c) => !c.hasFlights);
  assert.equal(han.priceText, "888.181 VND");
  assert.equal(han.nextTime, "08:00 13/10");
  assert.equal(han.href, "/search?origin=HAN&destination=SGN&departureDate=2026-10-13&tripType=one_way&passengerCount=1");
  assert.equal(sgn.nextTime, "00:30 14/10");
  assert.match(sgn.href, /departureDate=2026-10-14/); // UTC 17:30 ngày 13 = ngày 14 theo giờ VN, không lùi 1 ngày
  assert.match(noFlights.href, /departureDate=2026-10-12/); // chưa có chuyến -> dùng hôm nay
});

test("buildRouteCards: tên thành phố theo ngôn ngữ và hình dự phòng theo điểm đến", () => {
  const pick = (locale) => buildRouteCards({ stats, locale, todayStr: "2026-10-12" }).find((c) => c.key === "HAN-SGN");
  const vi = pick("vi");
  const en = pick("en");
  assert.deepEqual([vi.fromCity, vi.toCity], ["Hà Nội", "TP. Hồ Chí Minh"]);
  assert.deepEqual([en.fromCity, en.toCity], ["Hanoi", "Ho Chi Minh City"]);
  assert.equal(en.priceText, "VND 888,181");
  assert.equal(vi.art.motif, "skyline"); // điểm đến SGN
});

test("buildRouteCards: nhận cả object thường làm stats; không có số liệu nào -> mọi tuyến đều chưa có chuyến", () => {
  const fromObj = buildRouteCards({ stats: { "HAN-SGN": { minPrice: 1, nextDeparture: new Date("2026-10-13T01:00:00Z"), flights: 1 } }, locale: "vi", todayStr: "2026-10-12" });
  assert.equal(fromObj.find((c) => c.hasFlights).key, "HAN-SGN");
  const none = buildRouteCards({ stats: new Map(), locale: "vi", todayStr: "2026-10-12" });
  assert.ok(none.every((c) => !c.hasFlights));
  assert.deepEqual(none.map((c) => c.key), POPULAR_ROUTES.map(([o, d]) => routeKey(o, d))); // giữ nguyên thứ tự gốc
});

test("resolveRouteImage: chọn ảnh theo mã điểm đến viết thường, ưu tiên jpg; chưa có ảnh -> null", () => {
  const files = new Set(["images/routes/pqc.webp", "images/routes/dad.jpg", "images/routes/dad.png"]);
  const exists = (rel) => files.has(rel);
  assert.equal(resolveRouteImage("PQC", exists), "/images/routes/pqc.webp");
  assert.equal(resolveRouteImage("DAD", exists), "/images/routes/dad.jpg");
  assert.equal(resolveRouteImage("HAN", exists), null);
});

test("buildRouteCards: nhận bản ghi từ DB (thứ tự admin đặt, ảnh trong DB) — dbImageUrl chỉ khi có ảnh và có id", () => {
  const routes = [
    { origin_code: "HAN", dest_code: "PQC", id: "a1", has_image: true, image_version: 1760000000000 },
    { origin_code: "SGN", dest_code: "HAN", id: "b2", has_image: false, image_version: null },
    { origin_code: "SGN", dest_code: "DAD", id: null, has_image: true, image_version: 5 }, // thiếu id -> không dựng URL
  ];
  const cards = buildRouteCards({ stats: new Map(), locale: "vi", todayStr: "2026-10-12", routes });
  assert.deepEqual(cards.map((c) => c.key), ["HAN-PQC", "SGN-HAN", "SGN-DAD"]); // đúng thứ tự admin đặt
  assert.equal(cards[0].dbImageUrl, "/api/popular-routes/a1/image?v=1760000000000");
  assert.equal(cards[1].dbImageUrl, null);
  assert.equal(cards[2].dbImageUrl, null);
  assert.deepEqual(buildRouteCards({ stats: new Map(), locale: "vi", todayStr: "x", routes: [] }), []);
});
