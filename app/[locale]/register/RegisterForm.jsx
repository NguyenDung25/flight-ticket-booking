"use client";

// app/[locale]/register/RegisterForm.jsx

import { useActionState, useState } from "react";
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
  const [fullName, setFullName] = useState(() => readReg("fullName"));
  const [email, setEmail] = useState(() => readReg("email"));

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
          {state.error === "email_in_use" ? t("emailInUse") : tCommon("error")}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="mt-2 w-full">
        {isPending ? tCommon("loading") : t("registerButton")}
      </Button>
    </form>
  );
}
