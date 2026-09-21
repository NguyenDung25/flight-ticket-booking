"use client";

// app/[locale]/register/RegisterForm.jsx

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { registerAction } from "./actions";

const initialState = { error: null };

export default function RegisterForm() {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const [state, formAction, isPending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input
        name="full_name"
        type="text"
        label={t("fullName")}
        autoComplete="name"
        required
      />
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
