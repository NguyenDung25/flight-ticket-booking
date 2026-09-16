// auth.js
//
// C8 — cấp session/token thật cho NextAuth (Auth.js v5). Đúng như comment
// trong services/authService.js: file NÀY lo việc phát hành JWT, service
// chỉ lo phần dữ liệu (hash mật khẩu, chống trùng email, is_blocked).
//
// Dùng ở:
// - app/api/auth/[...nextauth]/route.js (export handlers GET/POST)
// - Server Component/Server Action bất kỳ cần biết user hiện tại: `await auth()`
// - proxy.js KHÔNG import file này trực tiếp — proxy dùng auth.config.js
//   (nhẹ hơn, xem comment trong file đó) qua `NextAuth(authConfig).auth`.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { verifyCredentials, AuthError } from "./services/authService";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mật khẩu", type: "password" },
      },
      // KHÔNG throw lỗi tự do ở đây — Auth.js v5 chỉ phân biệt "trả về
      // user" (đăng nhập thành công) hay "trả về null / throw" (thất bại),
      // và ẩn chi tiết lỗi khỏi client theo mặc định. Message cụ thể
      // ("Email hoặc mật khẩu không đúng." / "Tài khoản đã bị khóa.") được
      // set qua `AuthError` rồi đọc lại ở form đăng nhập qua `error` param
      // (sẽ nối khi làm trang /login) — KHÔNG lộ message chi tiết nếu chưa
      // làm bước đó, tạm thời để Auth.js tự map về lỗi chung.
      async authorize(credentials) {
        try {
          const user = await verifyCredentials({
            email: credentials?.email,
            password: credentials?.password,
          });
          // Trả về object này sẽ được đưa vào callback `jwt` bên dưới làm
          // `user` — CHỈ trả field cần thiết, authService đã tự loại bỏ
          // password_hash (sanitizeUser) nên an toàn để dùng thẳng.
          return {
            id: String(user._id),
            email: user.email,
            name: user.full_name,
            role: user.role,
            preferred_language: user.preferred_language,
          };
        } catch (err) {
          if (err instanceof AuthError) {
            // Trả null -> Auth.js coi là đăng nhập thất bại (CredentialsSignin).
            // KHÔNG throw thẳng AuthError ra ngoài vì Auth.js sẽ log như lỗi
            // hệ thống thay vì lỗi nghiệp vụ thông thường.
            return null;
          }
          throw err;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Nhúng thêm role/id vào JWT lúc đăng nhập (chỉ chạy khi `user` tồn tại,
    // tức đúng lần authorize() thành công — các lần refresh JWT sau đó
    // `user` sẽ undefined, giữ nguyên token cũ).
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.preferred_language = user.preferred_language;
      }
      return token;
    },
    // Đưa field từ token ra `session.user` để Server Component đọc qua
    // `await auth()`. KHÔNG bao giờ nhúng is_blocked vào đây — is_blocked
    // PHẢI đọc trực tiếp từ DB tại thời điểm hành động (xem
    // lib/requireActiveUser.js), nhúng vào JWT sẽ bị "đông cứng" tới khi
    // token hết hạn/refresh, sai đúng ghi chú q.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.preferred_language = token.preferred_language;
      }
      return session;
    },
  },
});
