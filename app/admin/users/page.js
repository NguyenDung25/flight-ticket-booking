import dbConnect from "@/lib/mongodb";
import { guardAdminPage } from "@/lib/adminPageGuard";
import User from "@/models/User";
import BlockToggleButton from "./BlockToggleButton";
import DeleteUserButton from "./DeleteUserButton";

export const metadata = {
  title: "Người dùng — Quản trị",
};

export default async function AdminUsersPage() {
  await guardAdminPage();
  await dbConnect();
  const usersDocs = await User.find({}, "-password_hash")
    .sort({ created_at: -1 })
    .limit(200)
    .lean();

  // Map về mảng thuần (bỏ mọi field không cần) trước khi truyền cho Client Component — _id là ObjectId (BSON).
  const users = usersDocs.map((u) => ({
    id: String(u._id),
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    is_blocked: u.is_blocked,
    created_at: u.created_at ? new Date(u.created_at).toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sea-900">Người dùng</h1>
        <p className="text-sm text-ink/60">{users.length} tài khoản</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-sand-100 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-sand-100 bg-sand-50 text-xs font-semibold uppercase tracking-wide text-ink/60">
            <tr>
              <th className="px-4 py-3">Họ tên</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Vai trò</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-sand-100 last:border-0">
                <td className="px-4 py-3">{u.full_name}</td>
                <td className="px-4 py-3 text-ink/70">{u.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.role === "admin" ? "bg-sea-900 text-white" : "bg-sand-100 text-ink/70"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink/60">
                  {/* timeZone tường minh để ngày hiển thị theo giờ VN, không theo múi giờ máy chủ. */}
                  {u.created_at
                    ? new Date(u.created_at).toLocaleDateString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {u.is_blocked ? (
                    <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                      Đã khóa
                    </span>
                  ) : (
                    <span className="rounded-full bg-sea-500/10 px-2 py-0.5 text-xs font-medium text-sea-700">
                      Hoạt động
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-start justify-end gap-2">
                    <BlockToggleButton userId={u.id} isBlocked={u.is_blocked} />
                    <DeleteUserButton userId={u.id} role={u.role} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
