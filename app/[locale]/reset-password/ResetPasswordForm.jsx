"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";

export default function ResetPasswordForm({ token }) {
  const t = useTranslations("Auth");
  const tAccount = useTranslations("Account");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) return setError(tAccount("passwordMismatch"));
    if (password.length < 6) return setError(tAccount("passwordTooShort"));
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("resetError"));
      router.replace("/login?reset=1");
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        id="reset-password"
        type="password"
        label={tAccount("newPassword")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Input
        id="reset-confirm"
        type="password"
        label={tAccount("confirmPassword")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving} className="w-full">
        {saving ? tAccount("saving") : t("resetButton")}
      </Button>
    </form>
  );
}
