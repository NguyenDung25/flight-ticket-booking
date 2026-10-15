"use client";

// app/[locale]/account/ChangePasswordForm.jsx — đổi mật khẩu (POST /api/users/me/password). Thành
// công thì mọi phiên đăng nhập (kể cả phiên này) hết hiệu lực -> chuyển sang trang đăng nhập.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";

export default function ChangePasswordForm() {
  const t = useTranslations("Account");
  const router = useRouter();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.next !== form.confirm) return setError(t("passwordMismatch"));
    if (form.next.length < 6) return setError(t("passwordTooShort"));
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: form.current, new_password: form.next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("saveError"));
      // Phiên hiện tại đã bị đăng xuất ở server — sang trang đăng nhập, refresh để header cập nhật.
      router.replace("/login?changed=1");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <Input
        id="current-password"
        type="password"
        label={t("currentPassword")}
        value={form.current}
        onChange={set("current")}
        autoComplete="current-password"
        required
      />
      <Input
        id="new-password"
        type="password"
        label={t("newPassword")}
        value={form.next}
        onChange={set("next")}
        autoComplete="new-password"
        minLength={6}
        required
      />
      <Input
        id="confirm-password"
        type="password"
        label={t("confirmPassword")}
        value={form.confirm}
        onChange={set("confirm")}
        autoComplete="new-password"
        minLength={6}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? t("saving") : t("changePassword")}
        </Button>
      </div>
    </form>
  );
}
