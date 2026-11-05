// Phân quyền quản trị theo bộ phận của hãng. Vai trò "admin" (ADMIN IT) giữ nguyên tên cũ và có toàn quyền.
const ADMIN_ROLES = Object.freeze(["admin", "admin_foc", "admin_kd", "admin_cs"]);

const ROLE_LABELS = Object.freeze({
  customer: "Khách hàng",
  admin: "ADMIN IT",
  admin_foc: "ADMIN FOC",
  admin_kd: "ADMIN KD",
  admin_cs: "ADMIN CS",
});

// Mô tả đầy đủ (dùng ở ô chọn vai trò).
const ROLE_DESCRIPTIONS = Object.freeze({
  admin: "ADMIN IT — quản trị hệ thống, toàn quyền",
  admin_foc: "ADMIN FOC — Trung tâm Điều hành khai thác bay",
  admin_kd: "ADMIN KD — Kinh doanh",
  admin_cs: "ADMIN CS — Chăm sóc khách hàng",
});

// Quyền -> các vai trò (ngoài ADMIN IT) được dùng. Quyền để rỗng chỉ ADMIN IT mới có.
const PERMISSIONS = Object.freeze({
  dashboard: ["admin_kd"], // Tổng quan: thống kê doanh thu
  flights: ["admin_foc"], // thêm/sửa/xóa/hủy chuyến bay, tuyến phổ biến, tra lịch AirLabs
  aircraft: ["admin_foc"], // máy bay và sơ đồ ghế
  flight_prices: ["admin_kd"], // đổi giá vé của chuyến bay đã tạo
  promotions: ["admin_kd"],
  ancillaries: ["admin_kd"], // bảng giá dịch vụ bổ sung
  bookings: ["admin_cs"], // đơn đặt vé, hủy thay khách, hoàn tiền thủ công
  refunds: ["admin_cs"], // nhật ký hoàn tiền
  users_view: ["admin_cs"], // xem danh sách người dùng
  users_manage: [], // khóa, xóa, phân quyền — chỉ ADMIN IT
  logs: [], // nhật ký thao tác — chỉ ADMIN IT
});

const isAdminRole = (role) => ADMIN_ROLES.includes(role);

function can(role, permission) {
  if (role === "admin") return true;
  return (PERMISSIONS[permission] || []).includes(role);
}

/** Trả về true nếu vai trò có ít nhất một trong các quyền. */
function canAny(role, permissions) {
  return permissions.some((p) => can(role, p));
}

module.exports = { ADMIN_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, PERMISSIONS, isAdminRole, can, canAny };
