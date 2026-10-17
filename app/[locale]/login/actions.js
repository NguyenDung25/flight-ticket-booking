"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { verifyCredentials, AuthError as ServiceAuthError } from "@/services/authService";

const DEFAULT_CUSTOMER_LANDING = "/";
const ADMIN_LANDING = "/admin";

export async function loginAction(_prevState, formData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const rawCallbackUrl = formData.get("callbackUrl") ?? "";
  // S3: chỉ chấp nhận callbackUrl nội bộ (bắt đầu bằng "/" nhưng không phải "//").
  const callbackUrl = rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//")
    ? rawCallbackUrl
    : "/";

  // Biết role trước khi thiết lập session — xem giải thích ở đầu file vì sao không đọc role sau signIn() nữa.
  let user;
  try {
    user = await verifyCredentials({ email, password });
  } catch (err) {
    if (err instanceof ServiceAuthError && err.statusCode === 429) {
      return { error: "too_many" };
    }
    if (err instanceof ServiceAuthError) {
      // Chỉ 1 thông báo lỗi chung cho mọi lý do thất bại (sai mật khẩu lẫn tài khoản bị khóa).
      return { error: "invalid" };
    }
    throw err;
  }

  // callbackUrl mặc định "/" không phải đích đến có Ý nghĩa (không phải trang bị proxy.js/admin layout chặn).
  const hasExplicitDestination = callbackUrl && callbackUrl !== DEFAULT_CUSTOMER_LANDING;
  const destination = hasExplicitDestination
    ? callbackUrl
    : user.role === "admin"
      ? ADMIN_LANDING
      : DEFAULT_CUSTOMER_LANDING;

  try {
    // redirectTo (không phải redirect:false) — signIn() tự điều hướng luôn bằng cách throw 1 lỗi nội bộ đặc biệt…
    await signIn("credentials", { email, password, redirectTo: destination });
  } catch (error) {
    if (error instanceof AuthError) {
      // JSDoc của CredentialsSignin (node_modules/@auth/core/errors.js) cảnh báo thẳng.
      return { error: "invalid" };
    }
    throw error;
  }
}