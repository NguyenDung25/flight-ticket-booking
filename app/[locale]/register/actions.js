"use server";

// app/[locale]/register/actions.js
//
// C8 — gọi thẳng services/authService.registerUser() (KHÔNG qua
// /api/auth/register) — Server Action đã chạy server-side sẵn, gọi thẳng
// service tiết kiệm 1 vòng HTTP. Route /api/auth/register vẫn giữ lại cho
// client khác (Postman/app di động sau này), không phải bị thay thế.
//
// Đăng ký xong gửi link xác thực email rồi tự signIn() luôn — khỏi bắt người dùng gõ lại mật khẩu.
// Chuyển về trang Tài khoản để khách thấy ngay trạng thái "chưa xác thực" + nút gửi lại.

import { registerUser, AuthError } from "@/services/authService";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { sendEmailVerificationLink } from "@/lib/emailVerification";

/**
 * @param {{ error: string|null }} _prevState
 * @param {FormData} formData
 * @returns {Promise<{ error: string|null }>}
 */
export async function registerAction(_prevState, formData) {
  const email = formData.get("email");
  const password = formData.get("password");

  let user;
  try {
    user = await registerUser({
      email,
      password,
      full_name: formData.get("full_name"),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // 409 (email đã tồn tại) AN TOÀN để hiện rõ ràng — KHÁC nguyên tắc
      // "generic message" của login/actions.js: ở ĐÂY chính người dùng đang
      // tự khai email của họ để đăng ký, không phải kẻ dò quét email người
      // khác, nên không phải user-enumeration.
      return { error: error.statusCode === 409 ? "email_in_use" : "generic" };
    }
    throw error;
  }

  // Gửi lỗi (SMTP chập chờn...) không làm hỏng việc đăng ký — khách bấm "Gửi lại" ở trang Tài khoản.
  try {
    const h = await headers();
    const origin = h.get("origin") || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
    await sendEmailVerificationLink({ userId: user._id, origin, force: true });
  } catch (error) {
    console.error("[register] Không gửi được email xác thực:", error.message);
  }

  try {
    // redirectTo ném lỗi điều hướng nội bộ Next.js khi thành công — PHẢI để
    // lọt qua (không nằm trong catch bên dưới, vì catch chỉ bọc registerUser).
    await signIn("credentials", { email, password, redirectTo: "/account?registered=1" });
    return { error: null };
  } catch (error) {
    // Cực hiếm: vừa tạo xong tài khoản mà signIn() vẫn lỗi (VD race-condition
    // bị khóa ngay sau khi tạo) — DB đã ghi thành công nên để lỗi trồi lên
    // tự nhiên thay vì báo "đăng ký thất bại" sai sự thật.
    throw error;
  }
}
