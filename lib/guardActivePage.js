import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/requireActiveUser";

/** @returns {Promise<Object>} user đang hoạt động; redirect về /login nếu chưa đăng nhập/bị khóa */
export async function guardActivePage(session) {
  try {
    return await requireActiveUser(session);
  } catch {
    redirect("/login");
  }
}
