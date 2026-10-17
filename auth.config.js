const authConfig = {
  pages: {
    // Dùng trang đăng nhập riêng; proxy.js tự thêm locale khi redirect.
    signIn: "/login",
  },
  session: {
    // JWT: thiết kế CSDL không có collection Session.
    strategy: "jwt",
  },
  callbacks: {
    // proxy.js dùng để biết request đã đăng nhập chưa; kiểm tra tài khoản bị khóa nằm ở requireActiveUser.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  // providers: [] — cố tình để trống, `auth.js` sẽ thêm CredentialsProvider.
  providers: [],
};

module.exports = authConfig;
