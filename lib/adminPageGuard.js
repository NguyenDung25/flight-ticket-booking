import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireAdminUser } from "@/lib/requireAdminUser";

/** Chặn trang quản trị: chưa đăng nhập -> trang đăng nhập; không đủ quyền -> về /admin (tự chuyển tới trang đầu tiên được phép). */
export async function guardAdminPage(permission) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  try {
    return await requireAdminUser(permission);
  } catch {
    redirect(permission ? "/admin" : "/");
  }
}
