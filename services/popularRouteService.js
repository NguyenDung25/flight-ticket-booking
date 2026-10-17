const mongoose = require("mongoose");
const PopularRoute = require("../models/PopularRoute");
const Airport = require("../models/Airport");
const { POPULAR_ROUTES } = require("../lib/popularRoutes");
const { MAX_IMAGE_BYTES, sniffImageType } = require("../lib/imageSniff");

class PopularRouteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PopularRouteError";
    this.statusCode = statusCode;
  }
}

function assertId(id) {
  if (!mongoose.isValidObjectId(id)) throw new PopularRouteError("ID tuyến không hợp lệ.", 400);
}

function toView(doc) {
  return {
    id: String(doc._id),
    origin_code: doc.origin_code,
    dest_code: doc.dest_code,
    active: doc.active,
    sort_order: doc.sort_order,
    has_image: !!doc.image?.content_type,
    image_version: doc.image?.updated_at ? new Date(doc.image.updated_at).getTime() : null,
    image_size: doc.image?.size ?? null,
  };
}

/** Danh sách cho admin (không kèm dữ liệu ảnh). usingDefaults = chưa tùy chỉnh (collection rỗng). */
async function listForAdmin() {
  const docs = await PopularRoute.find().sort({ sort_order: 1, created_at: 1 }).lean();
  return { routes: docs.map(toView), usingDefaults: docs.length === 0 };
}

/** Danh sách cho trang chủ: tuyến đang bật theo thứ tự admin đặt. */
async function listForHome() {
  const docs = await PopularRoute.find().sort({ sort_order: 1, created_at: 1 }).lean();
  if (docs.length === 0) {
    return POPULAR_ROUTES.map(([origin_code, dest_code]) => ({ origin_code, dest_code, id: null, has_image: false, image_version: null }));
  }
  return docs.filter((d) => d.active).map((d) => {
    const v = toView(d);
    return { origin_code: v.origin_code, dest_code: v.dest_code, id: v.id, has_image: v.has_image, image_version: v.image_version };
  });
}

/** Nạp 12 tuyến mặc định vào DB (chỉ khi đang rỗng), bỏ tuyến có sân bay chưa tồn tại trong hệ thống. */
async function seedDefaults() {
  if ((await PopularRoute.countDocuments()) > 0) throw new PopularRouteError("Danh sách đã được tùy chỉnh.", 409);
  const codes = [...new Set(POPULAR_ROUTES.flat())];
  const existing = new Set((await Airport.find({ code: { $in: codes } }, "code").lean()).map((a) => a.code));
  const usable = POPULAR_ROUTES.filter(([o, d]) => existing.has(o) && existing.has(d));
  if (usable.length === 0) throw new PopularRouteError("Chưa có sân bay nào trong hệ thống để tạo tuyến.", 409);
  await PopularRoute.insertMany(usable.map(([o, d], i) => ({ origin_code: o, dest_code: d, active: true, sort_order: i + 1 })), { ordered: false });
  return listForAdmin();
}

async function createRoute({ origin_code, dest_code }) {
  const origin = String(origin_code ?? "").trim().toUpperCase();
  const dest = String(dest_code ?? "").trim().toUpperCase();
  if (!origin || !dest) throw new PopularRouteError("Vui lòng chọn điểm đi và điểm đến.", 400);
  if (origin === dest) throw new PopularRouteError("Điểm đi và điểm đến không được trùng nhau.", 400);
  const found = await Airport.find({ code: { $in: [origin, dest] } }, "code").lean();
  if (found.length !== 2) throw new PopularRouteError("Sân bay không tồn tại trong hệ thống.", 400);
  if (await PopularRoute.exists({ origin_code: origin, dest_code: dest })) {
    throw new PopularRouteError("Tuyến này đã có trong danh sách.", 409);
  }
  const last = await PopularRoute.findOne().sort({ sort_order: -1 }).lean();
  await PopularRoute.create({ origin_code: origin, dest_code: dest, sort_order: (last?.sort_order ?? 0) + 1 });
  return listForAdmin();
}

/** Ghi lại sort_order liên tục 1..n theo thứ tự id đưa vào. */
async function renumber(orderedIds) {
  if (orderedIds.length === 0) return;
  await PopularRoute.bulkWrite(
    orderedIds.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sort_order: i + 1 } } } }))
  );
}

/** patch: { active?: boolean } hoặc { direction: "up" | "down" }. */
async function updateRoute(id, patch) {
  assertId(id);
  const doc = await PopularRoute.findById(id);
  if (!doc) throw new PopularRouteError("Không tìm thấy tuyến.", 404);

  if (patch.active !== undefined) {
    if (typeof patch.active !== "boolean") throw new PopularRouteError("active phải là true/false.", 400);
    doc.active = patch.active;
    await doc.save();
  }
  if (patch.direction !== undefined) {
    if (patch.direction !== "up" && patch.direction !== "down") throw new PopularRouteError("direction phải là up hoặc down.", 400);
    const all = await PopularRoute.find({}, "_id").sort({ sort_order: 1, created_at: 1 }).lean();
    const ids = all.map((d) => String(d._id));
    const i = ids.indexOf(String(id));
    const j = patch.direction === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < ids.length) {
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await renumber(ids);
    }
  }
  return listForAdmin();
}

async function deleteRoute(id) {
  assertId(id);
  const res = await PopularRoute.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw new PopularRouteError("Không tìm thấy tuyến.", 404);
  const rest = await PopularRoute.find({}, "_id").sort({ sort_order: 1, created_at: 1 }).lean();
  await renumber(rest.map((d) => d._id));
  return listForAdmin();
}

/** @param {Buffer} buffer nội dung file đã đọc từ form */
async function setImage(id, buffer) {
  assertId(id);
  if (!buffer || buffer.length === 0) throw new PopularRouteError("Chưa chọn file ảnh.", 400);
  if (buffer.length > MAX_IMAGE_BYTES) throw new PopularRouteError("Ảnh quá lớn (tối đa 1 MB).", 413);
  const type = sniffImageType(buffer);
  if (!type) throw new PopularRouteError("Chỉ nhận ảnh JPG, PNG hoặc WebP.", 415);
  const res = await PopularRoute.updateOne(
    { _id: id },
    { $set: { image: { data: buffer, content_type: type, size: buffer.length, updated_at: new Date() } } }
  );
  if (res.matchedCount === 0) throw new PopularRouteError("Không tìm thấy tuyến.", 404);
  return listForAdmin();
}

async function removeImage(id) {
  assertId(id);
  const res = await PopularRoute.updateOne({ _id: id }, { $unset: { image: "" } });
  if (res.matchedCount === 0) throw new PopularRouteError("Không tìm thấy tuyến.", 404);
  return listForAdmin();
}

/** Cho route công khai phục vụ ảnh. @returns {Promise<{data:Buffer,content_type:string}|null>} */
async function getImage(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await PopularRoute.findById(id).select("+image.data").lean();
  if (!doc?.image?.content_type || !doc.image.data) return null;
  const data = Buffer.isBuffer(doc.image.data) ? doc.image.data : Buffer.from(doc.image.data.buffer ?? doc.image.data);
  return { data, content_type: doc.image.content_type };
}

module.exports = {
  PopularRouteError, listForAdmin, listForHome, seedDefaults, createRoute, updateRoute, deleteRoute, setImage, removeImage, getImage,
};
