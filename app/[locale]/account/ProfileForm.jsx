"use client";

// app/[locale]/account/ProfileForm.jsx — sửa họ tên hiển thị (PATCH /api/users/me). Email là định danh
// đăng nhập nên chỉ hiển thị, không sửa ở đây.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";

export default function ProfileForm({ initialName, email }) {
  const t = useTranslations("Account");
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState({ state: "idle", message: null });

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ state: "saving", message: null });
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("saveError"));
      setName(data.full_name);
      setStatus({ state: "saved", message: t("profileSaved") });
      router.refresh(); // header hiện tên mới
    } catch (err) {
      setStatus({ state: "error", message: err.message });
    }
  }

  const unchanged = name.trim() === initialName;

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
      <Input id="account-email" label={t("email")} value={email} readOnly disabled />
      <Input
        id="account-name"
        label={t("fullName")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        autoComplete="name"
        required
      />
      {status.message && (
        <p role={status.state === "error" ? "alert" : "status"} className={`text-sm ${status.state === "error" ? "text-danger" : "text-sea-700"}`}>
          {status.message}
        </p>
      )}
      <div>
        <Button type="submit" disabled={status.state === "saving" || unchanged || !name.trim()}>
          {status.state === "saving" ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
