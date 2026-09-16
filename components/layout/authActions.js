"use server";

// components/layout/authActions.js
//
// Tách riêng file "use server" cho action — Header.jsx là Server Component,
// dùng thẳng <form action={signOutAction}> nên KHÔNG cần bọc client component
// nào chỉ để bấm nút đăng xuất.

import { signOut } from "@/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
