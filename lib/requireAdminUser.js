import { auth } from "../auth";
import { requireActiveUser, ActiveUserError } from "./requireActiveUser";

export async function requireAdminUser() {
  const session = await auth();
  const user = await requireActiveUser(session);

  if (user.role !== "admin") {
    throw new ActiveUserError("Yêu cầu quyền quản trị viên.", 403);
  }

  return user;
}
