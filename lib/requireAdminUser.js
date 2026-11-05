import { auth } from "../auth";
import { requireActiveUser, ActiveUserError } from "./requireActiveUser";
import { isAdminRole, canAny } from "../config/adminRoles";

/**
 * Yêu cầu tài khoản quản trị. Không truyền quyền: chấp nhận mọi vai trò quản trị (dùng cho layout).
 * Truyền một quyền (hoặc mảng quyền): vai trò phải có ít nhất một quyền đó (ADMIN IT luôn có).
 */
export async function requireAdminUser(permission) {
  const session = await auth();
  const user = await requireActiveUser(session);

  if (!isAdminRole(user.role)) {
    throw new ActiveUserError("Yêu cầu quyền quản trị viên.", 403);
  }
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!canAny(user.role, list)) {
      throw new ActiveUserError("Vai trò của bạn không có quyền thực hiện thao tác này.", 403);
    }
  }

  return user;
}
