// app/api/auth/[...nextauth]/route.js
//
// C8 — endpoint chuẩn của NextAuth (đăng nhập, đăng xuất, lấy session...).
// Toàn bộ logic thật nằm ở auth.js — file này chỉ re-export.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
