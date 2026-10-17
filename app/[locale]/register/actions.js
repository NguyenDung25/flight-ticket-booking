"use server";

import { registerUser, AuthError } from "@/services/authService";
import { headers } from "next/headers";
import { signIn } from "@/auth";
import { sendEmailVerificationLink } from "@/lib/emailVerification";
import { allowRegisterAttempt } from "@/lib/registerGuard";

export async function registerAction(_prevState, formData) {
  const email = formData.get("email");
  const password = formData.get("password");

  // Giới hạn theo IP — mỗi lần đăng ký gửi 1 email thật (lib/registerGuard.js).
  if (!allowRegisterAttempt(await headers())) {
    return { error: "too_many" };
  }

  let user;
  try {
    user = await registerUser({
      email,
      password,
      full_name: formData.get("full_name"),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // 409 (email đã tồn tại) an toàn để hiện rõ ràng — khác nguyên tắc "generic message" của login/actions.js.
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
    // redirectTo ném lỗi điều hướng nội bộ Next.js khi thành công — phải để lọt qua.
    await signIn("credentials", { email, password, redirectTo: "/account?registered=1" });
    return { error: null };
  } catch (error) {
    // Cực hiếm: vừa tạo xong tài khoản mà signIn() vẫn lỗi (VD race-condition bị khóa ngay sau khi tạo).
    throw error;
  }
}
