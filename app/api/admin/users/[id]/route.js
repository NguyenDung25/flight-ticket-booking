import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import { ActiveUserError } from "@/lib/requireActiveUser";
import User from "@/models/User";
import Booking from "@/models/Booking";
import { logAdminAction } from "@/lib/adminLog";

export async function PATCH(request, { params }) {
  try {
    await dbConnect();
    const admin = await requireAdminUser();
    const { id } = await params;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.is_blocked !== "boolean") {
      throw new ActiveUserError('Body phải có field "is_blocked" kiểu boolean.', 400);
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
    const admin = await requireAdminUser();
    const { id } = await params;

    if (id === String(admin._id)) {
      throw new ActiveUserError("Không thể tự xóa chính tài khoản đang đăng nhập.", 400);
    }

    const user = await User.findById(id).catch(() => null);
    if (!user) {
      throw new ActiveUserError("Không tìm thấy người dùng.", 404);
    }
    if (user.role === "admin") {
      throw new ActiveUserError("Không xóa được tài khoản admin.", 403);
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
