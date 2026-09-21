"use server";

// app/[locale]/login/actions.js
//
// C8 — Server Action đăng nhập, dùng với useActionState (React 19) từ
// LoginForm.jsx. Theo ĐÚNG khuyến cáo chính thức của Auth.js v5 (xem
// node_modules/@auth/core/errors.js, JSDoc của CredentialsSignin): "If you
// throw this error in a framework that handles form actions server-side,
// this error is thrown INSTEAD OF redirecting" — nghĩa là auth.config.js
// pages.signIn + ?error= KHÔNG tự động áp dụng khi gọi qua Server Action như
// ở đây, PHẢI tự try/catch, không có cách nào khác.
//
// CHỈ 1 THÔNG BÁO LỖI CHUNG cho mọi lý do đăng nhập thất bại (sai mật khẩu
// LẪN tài khoản bị khóa) — dù services/authService.js có set message riêng
// cho từng trường hợp, KHÔNG đưa message đó ra ngoài qua đây. Lý do: chính
// JSDoc của CredentialsSignin cảnh báo thẳng "we don't recommend hinting
// specifically if the user had either a wrong username or password
// specifically" — hiện "tài khoản đã bị khóa" riêng sẽ xác nhận với kẻ dò
// quét rằng email đó CÓ tồn tại (user enumeration), đúng nguyên tắc
// verifyCredentials() đã áp dụng cho case sai mật khẩu/không tồn tại.

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

/**
 * @param {{ error: string|null }} _prevState - state trước đó từ useActionState, không dùng tới
 * @param {FormData} formData
 * @returns {Promise<{ error: string|null }>}
 */
export async function loginAction(_prevState, formData) {
  const callbackUrl = formData.get("callbackUrl") || "/";

  try {
    // redirectTo mặc định điều hướng bằng cách throw 1 lỗi nội bộ của
    // Next.js (KHÔNG phải AuthError) — always rethrow ở nhánh catch dưới để
    // Next.js tự xử lý điều hướng đó, không được nuốt.
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl,
    });
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "invalid" };
    }
    throw error;
  }
}
