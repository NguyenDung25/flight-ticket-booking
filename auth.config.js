const authConfig = {
  pages: {
    // Trang đăng nhập tự viết (chưa làm ở bước này) — không dùng trang mặc
    // Định của NextAuth. Route thật không có locale prefix ở đây vì proxy.js
    // Sẽ tự thêm locale đúng khi redirect (xem proxy.js).
    signIn: "/login",
  },
  session: {
    // JWT — không dùng Adapter/DB session vì mongodb-schema-design.md không
    // Có collection Session riêng (đã kiểm tra trong tài liệu thiết kế).
    strategy: "jwt",
  },
  callbacks: {
    // Dùng bởi proxy.js (qua NextAuth(authConfig).auth) để quyết định 1
    // request có được coi là "đã đăng nhập" hay không. `auth` ở đây là
    // session rút ra từ JWT trong cookie — không phải là check is_blocked
    // (việc đó thuộc `lib/requireActiveUser.js`, chạy ở API route, xem
    // comment trong file đó để rõ vì sao tách 2 việc này).
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  // providers: [] — cố tình để trống, `auth.js` sẽ thêm CredentialsProvider.
  providers: [],
};

module.exports = authConfig;
