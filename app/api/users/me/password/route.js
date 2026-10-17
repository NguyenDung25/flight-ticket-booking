import { NextResponse } from "next/server";
import { auth, signOut } from "@/auth";
import dbConnect from "@/lib/mongodb";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { changePassword } from "@/services/accountService";

export async function POST(request) {
  try {
    await dbConnect();
    const user = await requireActiveUser(await auth());
    const body = (await request.json().catch(() => null)) ?? {};

    await changePassword({
      user,
      currentPassword: body.current_password,
      newPassword: body.new_password,
    });

    // Xóa cookie phiên hiện tại luôn (phiên này cũng đã hết hiệu lực theo password_changed_at).
    await signOut({ redirect: false }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "POST /api/users/me/password");
  }
}
