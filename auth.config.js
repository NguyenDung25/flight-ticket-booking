// auth.config.js
//
// Tách riêng phần config KHÔNG đụng tới DB/bcrypt khỏi `auth.js` — file này
// được `proxy.js` import để check "đã đăng nhập chưa" trên MỌI request.
// Nếu để CredentialsProvider (import bcryptjs + mongoose + models) chung
// vào đây, proxy sẽ phải load toàn bộ cây phụ thuộc đó trên mỗi request,
// kể cả những trang không cần biết gì về DB — tách ra giữ proxy nhẹ và rõ
// ràng: proxy CHỈ trả lời được câu "có JWT hợp lệ hay không", không tự
// verify lại credentials.
//
// `auth.js` (đầy đủ, có CredentialsProvider) sẽ `...authConfig` rồi thêm
// `providers` vào, dùng ở app/api/auth/[...nextauth]/route.js.

const authConfig = {
  pages: {
    // Trang đăng nhập tự viết (chưa làm ở bước này) — không dùng trang mặc
    // định của NextAuth. Route thật KHÔNG có locale prefix ở đây vì proxy.js
    // sẽ tự thêm locale đúng khi redirect (xem proxy.js).
    signIn: "/login",
  },
  session: {
    // JWT — không dùng Adapter/DB session vì mongodb-schema-design.md KHÔNG
    // có collection Session riêng (đã kiểm tra trong tài liệu thiết kế).
    strategy: "jwt",
  },
  callbacks: {
    // Dùng bởi proxy.js (qua NextAuth(authConfig).auth) để quyết định 1
    // request có được coi là "đã đăng nhập" hay không. `auth` ở đây là
    // session rút ra từ JWT trong cookie — KHÔNG phải là check is_blocked
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
