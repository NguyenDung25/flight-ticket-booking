"use server";

// app/[locale]/login/actions.js
//
// C8 — Server Action đăng nhập, dùng với useActionState (React 19) từ
// LoginForm.jsx.
//
// BUG THẬT (lần 2) đã sửa: bản trước dùng signIn({redirect:false}) rồi gọi
// auth() ngay sau đó để đọc role -> LUÔN đọc ra session rỗng, không do lỗi
// gõ mà do CHÍNH CƠ CHẾ next-auth v5 (đã đọc thẳng source, xem
// node_modules/next-auth/lib/index.js): auth() gọi KHÔNG tham số dùng
// headers() từ "next/headers" — bản snapshot ĐÓNG BĂNG của header request
// gốc lúc browser gửi lên — KHÔNG PHẢI cookies() (nơi signIn() vừa
// cookies().set() cookie session mới). 2 API này tách biệt: cookies().set()
// chỉ cập nhật bản nháp cho các lần gọi cookies() sau, headers() thì không
// bao giờ thấy được cookie mới đó dù cùng 1 request. Kết quả: auth() gọi
// ngay sau signIn({redirect:false}) LUÔN trả về session rỗng, bất kể đăng
// nhập ai — genesis đúng của bug "admin đăng nhập xong vẫn về trang chủ
// khách hàng".
//
// CÁCH SỬA ĐÚNG: KHÔNG đọc lại session sau signIn() nữa — biết role TRƯỚC
// khi gọi signIn(), bằng cách tự gọi verifyCredentials() (CHÍNH service mà
// authorize() trong auth.js cũng gọi) TRỰC TIẾP ở đây trước, rồi tính sẵn
// destination, truyền thẳng qua signIn(..., { redirectTo: destination }) —
// quay lại dùng redirectTo (không phải redirect:false) vì giờ không cần
// đọc lại session nữa, redirectTo tự signIn() xử lý điều hướng luôn, đơn
// giản và đã được kiểm chứng hoạt động đúng từ đầu dự án.
//
// Đánh đổi: verifyCredentials() bị gọi 2 LẦN (1 lần ở đây, 1 lần nữa bên
// trong authorize() khi signIn() thực thi) — nghĩa là bcrypt.compare() chạy
// 2 lần cho 1 lượt đăng nhập. Chấp nhận được (đăng nhập không phải hot path
// gọi hàng nghìn lần/giây) để đổi lấy code ĐÚNG và ĐƠN GIẢN, thay vì cố
// tối ưu 1 lần bcrypt rồi vướng lại đúng bug cookie-timing ở trên.

import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { verifyCredentials, AuthError as ServiceAuthError } from "@/services/authService";

const DEFAULT_CUSTOMER_LANDING = "/";
const ADMIN_LANDING = "/admin";

/**
 * @param {{ error: string|null }} _prevState - state trước đó từ useActionState, không dùng tới
 * @param {FormData} formData
 * @returns {Promise<{ error: string|null }>}
 */
export async function loginAction(_prevState, formData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const callbackUrl = formData.get("callbackUrl");

  // Biết role TRƯỚC khi thiết lập session — xem giải thích ở đầu file vì
  // sao KHÔNG đọc role SAU signIn() nữa.
  let user;
  try {
    user = await verifyCredentials({ email, password });
  } catch (err) {
    if (err instanceof ServiceAuthError) {
      // CHỈ 1 THÔNG BÁO LỖI CHUNG cho mọi lý do thất bại (sai mật khẩu LẪN
      // tài khoản bị khóa) — chống user-enumeration, xem giải thích đầy đủ
      // ở nhánh catch bên dưới (AuthError của next-auth, lý do giống hệt).
      return { error: "invalid" };
    }
    throw err;
  }

  // callbackUrl mặc định "/" không phải đích đến CÓ Ý NGHĨA (không phải
  // trang bị proxy.js/admin layout chặn) — coi là "chưa có đích cụ thể", để
  // role quyết định thay. Một callbackUrl KHÁC "/" (proxy.js tự gắn khi
  // chặn route cần đăng nhập, hoặc admin layout gắn "/admin") LUÔN được tôn
  // trọng trước, bất kể role.
  const hasExplicitDestination = callbackUrl && callbackUrl !== DEFAULT_CUSTOMER_LANDING;
  const destination = hasExplicitDestination
    ? callbackUrl
    : user.role === "admin"
      ? ADMIN_LANDING
      : DEFAULT_CUSTOMER_LANDING;

  try {
    // redirectTo (KHÔNG phải redirect:false) — signIn() tự điều hướng luôn
    // bằng cách throw 1 lỗi nội bộ đặc biệt của Next.js khi thành công,
    // PHẢI để lọt qua (throw error ở catch bên dưới, KHÔNG được nuốt).
    await signIn("credentials", { email, password, redirectTo: destination });
  } catch (error) {
    if (error instanceof AuthError) {
      // JSDoc của CredentialsSignin (node_modules/@auth/core/errors.js)
      // cảnh báo thẳng: "we don't recommend hinting specifically if the
      // user had either a wrong username or password specifically" — hiện
      // "tài khoản đã bị khóa" riêng sẽ xác nhận với kẻ dò quét rằng email
      // đó CÓ tồn tại (user enumeration).
      return { error: "invalid" };
    }
    throw error;
  }
}