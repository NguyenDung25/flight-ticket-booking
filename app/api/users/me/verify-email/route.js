import { NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/mongodb";
import { requireActiveUser } from "@/lib/requireActiveUser";
import { handleApiError } from "@/lib/apiError";
import { isEmailConfigured } from "@/lib/emailClient";
import { sendEmailVerificationLink } from "@/lib/emailVerification";

export async function POST(request) {
  try {
    await dbConnect();
    const user = await requireActiveUser(await auth());
    const sent = await sendEmailVerificationLink({ userId: user._id, origin: request.nextUrl.origin });
    // Không gửi được (chưa cấu hình SMTP / lỗi SMTP) thì nói thật, không báo "đã gửi".
    return NextResponse.json({ sent, email_configured: isEmailConfigured() });
  } catch (err) {
    return handleApiError(err, "POST /api/users/me/verify-email");
  }
}
