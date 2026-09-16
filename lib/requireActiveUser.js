// lib/requireActiveUser.js
//
// Ghi chú q (models/User.js) + mục "is_blocked check-lại trực tiếp từ DB"
// (mongodb-schema-design.md): session/JWT của NextAuth có thể vẫn còn hiệu
// lực dù admin VỪA khóa tài khoản — token không tự invalidate. Nên ở MỌI
// hành động nhạy cảm (giữ ghế C5, tạo booking C6, thanh toán, hủy vé C9,
// check-in C10...), API route PHẢI gọi hàm này để đọc thẳng `is_blocked`
// từ DB, KHÔNG được chỉ tin `session.user` lấy từ JWT.
//
// KHÔNG dùng hàm này ở proxy.js — proxy chạy trên MỌI request (kể cả trang
// tĩnh), gọi DB ở đó sẽ chậm toàn bộ site cho lợi ích không tương xứng; chỉ
// cần proxy chặn theo việc "đã đăng nhập hay chưa" (JWT có/không), còn
// "đã bị khóa chưa" thì để đúng lúc, đúng chỗ như comment trên.
//
// Cách dùng trong API route:
//   const session = await auth();
//   const user = await requireActiveUser(session); // ném lỗi nếu chưa đăng
//                                                    // nhập / tài khoản bị khóa
//   ... dùng user._id, user.role ...

const User = require("../models/User");
const dbConnect = require("./mongodb");

class ActiveUserError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * @param {import("next-auth").Session | null} session - kết quả của `await auth()`
 * @returns {Promise<Object>} User document đầy đủ (còn password_hash — chỉ
 *   dùng nội bộ server, KHÔNG trả thẳng object này ra response)
 * @throws {ActiveUserError} 401 nếu chưa đăng nhập/tài khoản không còn tồn
 *   tại, 403 nếu tài khoản đã bị khóa
 */
async function requireActiveUser(session) {
  if (!session?.user?.id) {
    throw new ActiveUserError("Bạn cần đăng nhập để thực hiện thao tác này.", 401);
  }

  await dbConnect();

  const user = await User.findById(session.user.id);
  if (!user) {
    // Tài khoản có thể đã bị xóa hẳn sau khi JWT được cấp.
    throw new ActiveUserError("Tài khoản không tồn tại.", 401);
  }

  if (user.is_blocked) {
    throw new ActiveUserError("Tài khoản đã bị khóa.", 403);
  }

  return user;
}

module.exports = { requireActiveUser, ActiveUserError };
