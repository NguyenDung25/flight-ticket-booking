import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { ActiveUserError } from "@/lib/requireActiveUser";
import User from "@/models/User";
import Booking from "@/models/Booking";
import { logAdminAction } from "@/lib/adminLog";
import { ADMIN_ROLES, ROLE_LABELS, isAdminRole } from "@/config/adminRoles";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser("users_manage");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const hasBlock = typeof body?.is_blocked === "boolean";
    const hasRole = typeof body?.role === "string";
    if (!body || hasBlock === hasRole) {
      throw new ActiveUserError("Body phải có đúng một trong hai field: is_blocked (boolean) hoặc role (chuỗi).", 400);
    }

    // Phân quyền quản trị: đổi vai trò của tài khoản (customer hoặc một trong các vai trò quản trị).
    if (hasRole) {
      if (body.role !== "customer" && !ADMIN_ROLES.includes(body.role)) {
        throw new ActiveUserError("Vai trò không hợp lệ.", 400);
      }
      if (id === String(admin._id)) {
        throw new ActiveUserError("Không thể tự đổi vai trò của chính tài khoản đang đăng nhập.", 400);
      }
      const target = await User.findById(id).select("email role").catch(() => null);
      if (!target) throw new ActiveUserError("Không tìm thấy người dùng.", 404);
      if (target.role === body.role) {
        return NextResponse.json({ user: target });
      }
      const user = await User.findByIdAndUpdate(
        id,
        { $set: { role: body.role } },
        { returnDocument: "after", select: "-password_hash" }
      );
      await logAdminAction(admin, {
        action: "user.role", targetType: "user", targetId: id,
        summary: `Đổi vai trò ${user.email}: ${ROLE_LABELS[target.role] || target.role} → ${ROLE_LABELS[body.role]}`,
      });
      return NextResponse.json({ user });
    }

    if (id === String(admin._id) && body.is_blocked === true) {
      throw new ActiveUserError("Không thể tự khóa chính tài khoản đang đăng nhập.", 400);
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: { is_blocked: body.is_blocked } },
      { returnDocument: "after", select: "-password_hash" }
    );

    if (!user) {
      throw new ActiveUserError("Không tìm thấy người dùng.", 404);
    }

    await logAdminAction(admin, {
      action: user.is_blocked ? "user.block" : "user.unblock", targetType: "user", targetId: id,
      summary: `${user.is_blocked ? "Khóa" : "Mở khóa"} tài khoản ${user.email}`,
    });
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err, "PATCH /api/admin/users/[id]");
  }
}

/** A4 — xóa hẳn 1 tài khoản khách. */
export async function DELETE(_request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser("users_manage");
    const { id } = await params;

    if (id === String(admin._id)) {
      throw new ActiveUserError("Không thể tự xóa chính tài khoản đang đăng nhập.", 400);
    }

    const user = await User.findById(id).catch(() => null);
    if (!user) {
      throw new ActiveUserError("Không tìm thấy người dùng.", 404);
    }
    if (isAdminRole(user.role)) {
      throw new ActiveUserError("Không xóa được tài khoản quản trị. Hãy đổi về Khách hàng trước.", 403);
    }

    const bookingCount = await Booking.countDocuments({ user_id: user._id });
    if (bookingCount > 0) {
      throw new ActiveUserError(
        `Không thể xóa: tài khoản có ${bookingCount} booking. Hãy dùng "Khóa" thay vì xóa để giữ dữ liệu đối soát.`,
        409
      );
    }

    await user.deleteOne();
    await logAdminAction(admin, {
      action: "user.delete", targetType: "user", targetId: id,
      summary: `Xóa tài khoản ${user.email}`,
    });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return handleApiError(err, "DELETE /api/admin/users/[id]");
  }
}
