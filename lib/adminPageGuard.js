// lib/adminPageGuard.js
//
// Next.js KHÔNG chạy lại layout khi điều hướng phía client giữa các trang con, trong khi các page
// admin đọc DB trực tiếp (Server Component). Nếu chỉ kiểm tra quyền ở app/admin/layout.js thì admin
// vừa bị khóa/hạ quyền nhưng còn tab mở vẫn xem được dữ liệu ở trang khác. Mỗi page admin phải tự
// gọi guardAdminPage() ở đầu.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requireAdminUser } from "@/lib/requireAdminUser";

export async function guardAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");
  try {
    await requireAdminUser();
  } catch {
    redirect("/");
  }
}
