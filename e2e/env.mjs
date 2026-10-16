// e2e/env.mjs — cấu hình dùng chung cho test E2E. Database luôn có chữ "e2e" trong tên (global-setup
// từ chối chạy nếu không) để không bao giờ seed/xóa nhầm database thật.
const SERVER = (process.env.E2E_MONGO_URL || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
export const E2E_DB_NAME = "ftb-e2e";
export const E2E_MONGO_URI = `${SERVER}/${E2E_DB_NAME}`;
export const E2E_PORT = Number(process.env.E2E_PORT || 3100);
