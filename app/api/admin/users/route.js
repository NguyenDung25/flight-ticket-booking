// app/api/admin/users/route.js
//
// A4 — danh sách user cho admin. Không trả password_hash ra ngoài (dù chỉ
// admin xem — vẫn không có lý do gì để hash ra khỏi server).

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/requireAdminUser";
import { handleApiError } from "@/lib/apiError";
import User from "@/models/User";

export async function GET(request) {
  try {
    await dbConnect();
    await requireAdminUser();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 200, 500);

    const users = await User.find({}, "-password_hash")
      .sort({ created_at: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err, "GET /api/admin/users");
  }
}
