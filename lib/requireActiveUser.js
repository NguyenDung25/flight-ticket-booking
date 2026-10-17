const User = require("../models/User");
const dbConnect = require("./mongodb");

class ActiveUserError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

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

  // Mật khẩu vừa được đổi/đặt lại sau lúc phiên này đăng nhập -> phiên cũ hết hiệu lực.
  if (isSessionOlderThanPasswordChange(session, user)) {
    throw new ActiveUserError("Mật khẩu vừa được thay đổi, vui lòng đăng nhập lại.", 401);
  }

  return user;
}

/** true nếu phiên đăng nhập được cấp trước lần đổi mật khẩu gần nhất của user. */
function isSessionOlderThanPasswordChange(session, user) {
  if (!user.password_changed_at) return false;
  const authAt = Number(session?.user?.auth_at);
  return !authAt || authAt < new Date(user.password_changed_at).getTime();
}

module.exports = { requireActiveUser, ActiveUserError, isSessionOlderThanPasswordChange };
