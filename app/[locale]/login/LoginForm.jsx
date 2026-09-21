"use client";

// app/[locale]/login/LoginForm.jsx
//
// useActionState (React 19, đã có trong package.json ^19.2.8) thay vì tự
// quản lý isSubmitting/error bằng useState — action trả state mới thay vì
// redirect khi lỗi, nên KHÔNG cần lo locale-aware redirect trong Server
// Action (xem actions.js), tránh hẳn vấn đề routing.localePrefix
// "as-needed"/"always" ảnh hưởng tới URL lỗi.

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { loginAction } from "./actions";

const initialState = { error: null };

export default function LoginForm({ callbackUrl }) {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <Input
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        required
      />
      <Input
        name="password"
        type="password"
        label={t("password")}
        autoComplete="current-password"
        required
      />

      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {t("invalidCredentials")}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="mt-2 w-full">
        {isPending ? tCommon("loading") : t("loginButton")}
      </Button>
    </form>
  );
}
