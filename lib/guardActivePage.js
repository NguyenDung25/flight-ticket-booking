// lib/guardActivePage.js
//
// Trang khách (my-bookings, vé, check-in, thanh toán) trước đây chỉ dùng auth() (đọc JWT), nên tài
// khoản VỪA BỊ KHÓA vẫn xem được dữ liệu cho tới khi JWT hết hạn. API đã kiểm tra DB mỗi request
// (requireActiveUser); helper này làm điều tương tự cho Server Component page.
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
