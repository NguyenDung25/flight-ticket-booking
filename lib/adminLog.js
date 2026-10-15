// lib/adminLog.js
//
// Ghi nhật ký thao tác admin (models/AdminLog.js). Gọi SAU KHI thao tác đã thành công. Lỗi ghi nhật ký
// chỉ in log server, KHÔNG làm hỏng thao tác chính (thao tác đã xong, không thể rollback vì nhật ký).

const AdminLog = require("../models/AdminLog");

const MAX_DETAILS_LENGTH = 4000; // chặn lưu object khổng lồ (VD cả seat_map_template) vào nhật ký

/** Rút gọn details: chỉ giữ giá trị đơn giản, bỏ field nhạy cảm, cắt chuỗi quá dài. */
function compactDetails(details) {
  if (!details || typeof details !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(details)) {
    if (/password|token|secret/i.test(k) || v === undefined) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = v;
    else if (v instanceof Date) out[k] = v.toISOString();
    else if (Array.isArray(v)) out[k] = `[${v.length} mục]`;
    else out[k] = String(v._id ?? v);
  }
  const json = JSON.stringify(out);
  return json.length > MAX_DETAILS_LENGTH ? { note: "chi tiết quá dài, đã lược bỏ" } : out;
}

/**
 * @param {Object} admin - User document của admin (kết quả requireAdminUser())
 * @param {{ action: string, targetType: string, targetId?: any, summary: string, details?: Object }} entry
 */
async function logAdminAction(admin, { action, targetType, targetId = null, summary, details = null }) {
  try {
    await AdminLog.create({
      admin_id: admin._id,
      admin_email: admin.email,
      action,
      target_type: targetType,
      target_id: targetId === null || targetId === undefined ? null : String(targetId),
      summary,
      details: compactDetails(details),
    });
  } catch (err) {
    console.error(`[adminLog] Không ghi được nhật ký "${action}":`, err.message);
  }
}

module.exports = { logAdminAction, compactDetails };
