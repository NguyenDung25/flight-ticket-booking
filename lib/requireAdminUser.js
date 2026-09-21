// lib/requireAdminUser.js
//
// A1/A2/A4... — mọi route trong app/api/admin/* đều cần ĐÃ đăng nhập VÀ
// role="admin". `requireActiveUser()` (lib/requireActiveUser.js) chỉ check
// "đã đăng nhập + chưa bị khóa", KHÔNG check role — gói thêm 1 lớp ở đây để
// không phải lặp lại đoạn check role ở từng route admin riêng lẻ.

import { auth } from "../auth";
import { requireActiveUser, ActiveUserError } from "./requireActiveUser";

/**
 * @returns {Promise<Object>} User document đầy đủ (role chắc chắn "admin")
 * @throws {ActiveUserError} 401 nếu chưa đăng nhập, 403 nếu đã đăng nhập
 *   nhưng KHÔNG phải admin (hoặc tài khoản bị khóa)
 */
export async function requireAdminUser() {
  const session = await auth();
  const user = await requireActiveUser(session);

  if (user.role !== "admin") {
    throw new ActiveUserError("Yêu cầu quyền quản trị viên.", 403);
  }

  return user;
}
