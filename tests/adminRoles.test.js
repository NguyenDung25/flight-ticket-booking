const test = require("node:test");
const assert = require("node:assert/strict");
const { ADMIN_ROLES, PERMISSIONS, can, canAny, isAdminRole } = require("../config/adminRoles");

test("ADMIN IT (admin) có mọi quyền", () => {
  for (const p of Object.keys(PERMISSIONS)) assert.equal(can("admin", p), true, p);
});

test("khách hàng và vai trò lạ không có quyền nào", () => {
  for (const p of Object.keys(PERMISSIONS)) {
    assert.equal(can("customer", p), false, p);
    assert.equal(can("hacker", p), false, p);
    assert.equal(can(undefined, p), false, p);
  }
  assert.equal(isAdminRole("customer"), false);
});

test("ADMIN FOC: chuyến bay, máy bay; không đổi giá vé, không xem nhật ký", () => {
  assert.equal(can("admin_foc", "flights"), true);
  assert.equal(can("admin_foc", "aircraft"), true);
  assert.equal(can("admin_foc", "flight_prices"), false);
  assert.equal(can("admin_foc", "logs"), false);
  assert.equal(can("admin_foc", "bookings"), false);
});

test("ADMIN KD: doanh thu, khuyến mãi, giá vé, dịch vụ bổ sung; không sửa chuyến bay", () => {
  for (const p of ["dashboard", "promotions", "flight_prices", "ancillaries"]) assert.equal(can("admin_kd", p), true, p);
  assert.equal(can("admin_kd", "flights"), false);
  assert.equal(can("admin_kd", "bookings"), false);
});

test("ADMIN CS: đơn đặt vé, hoàn tiền, xem người dùng; không khóa/phân quyền, không xem nhật ký", () => {
  for (const p of ["bookings", "refunds", "users_view"]) assert.equal(can("admin_cs", p), true, p);
  assert.equal(can("admin_cs", "users_manage"), false);
  assert.equal(can("admin_cs", "logs"), false);
  assert.equal(can("admin_cs", "flights"), false);
});

test("chỉ ADMIN IT phân quyền người dùng và xem nhật ký", () => {
  for (const role of ADMIN_ROLES.filter((r) => r !== "admin")) {
    assert.equal(can(role, "users_manage"), false, role);
    assert.equal(can(role, "logs"), false, role);
  }
});

test("canAny: đủ một trong các quyền là được", () => {
  assert.equal(canAny("admin_kd", ["flights", "flight_prices"]), true);
  assert.equal(canAny("admin_cs", ["flights", "flight_prices"]), false);
});
