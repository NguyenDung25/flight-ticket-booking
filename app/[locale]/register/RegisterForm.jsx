"use client";

// app/[locale]/register/RegisterForm.jsx

import { useActionState, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { registerAction } from "./actions";

const initialState = { error: null };

function readReg(key, fallback = "") {
  try { return sessionStorage.getItem("reg_" + key) ?? fallback; } catch { return fallback; }
}
function saveReg(key, value) {
  try { sessionStorage.setItem("reg_" + key, value); } catch {}
}

export default function RegisterForm() {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  // Lưu name/email vào sessionStorage để không mất khi đổi ngôn ngữ.
  // Không lưu password — không bao giờ lưu password vào storage.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  // Render lần đầu bằng giá trị MẶC ĐỊNH (giống server — server không đọc được sessionStorage), rồi mới
  // khôi phục lựa chọn cũ sau khi chạy trên trình duyệt; đọc sessionStorage ngay trong useState làm HTML
  // server và client lệch nhau (lỗi hydration). setTimeout: không setState trực tiếp trong effect.
  useEffect(() => {
    const id = setTimeout(() => {
      setFullName(readReg("fullName"));
      setEmail(readReg("email"));
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        name="full_name"
        type="text"
        label={t("fullName")}
        autoComplete="name"
        required
        value={fullName}
        onChange={(e) => { setFullName(e.target.value); saveReg("fullName", e.target.value); }}
      />
      <Input
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        required
        value={email}
        onChange={(e) => { setEmail(e.target.value); saveReg("email", e.target.value); }}
      />
      <Input
        name="password"
        type="password"
        label={t("password")}
        autoComplete="new-password"
        minLength={6}
        required
      />

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error === "email_in_use"
            ? t("emailInUse")
            : state.error === "too_many"
              ? t("registerTooMany")
              : tCommon("error")}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="mt-2 w-full">
        {isPending ? tCommon("loading") : t("registerButton")}
      </Button>
    </form>
  );
}
