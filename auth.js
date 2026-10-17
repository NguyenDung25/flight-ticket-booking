import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import dbConnect from "./lib/mongodb";
import { verifyCredentials, AuthError } from "./services/authService";

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mật khẩu", type: "password" },
      },
      // Không throw lỗi tự do ở đây — Auth.js v5 chỉ phân biệt "trả về user".
      async authorize(credentials) {
        // Bắt buộc: verifyCredentials() query User model — không mở kết nối trước thì mongoose treo.
        await dbConnect();
        try {
          const user = await verifyCredentials({
            email: credentials?.email,
            password: credentials?.password,
          });
          // Trả về object này sẽ được đưa vào callback `jwt` bên dưới làm `user` — chỉ trả field cần thiết.
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
            return null;
          }
          throw err;
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // `trigger === "update"`: gọi unstable_update() sau khi khách sửa họ tên ở trang Tài khoản.
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.preferred_language = user.preferred_language;
        // Thời điểm đăng nhập — so với User.password_changed_at để vô hiệu hóa phiên cũ sau khi đổi/đặt lại mật khẩu.
        token.auth_at = Date.now();
      }
      if (trigger === "update" && typeof session?.user?.name === "string") {
        token.name = session.user.name;
      }
      return token;
    },
    // Đưa field từ token ra `session.user` để Server Component đọc qua `await auth()`.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.preferred_language = token.preferred_language;
        session.user.auth_at = token.auth_at ?? null;
      }
      return session;
    },
  },
});
