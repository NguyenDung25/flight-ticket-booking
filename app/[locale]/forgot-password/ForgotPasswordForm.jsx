"use client";

// app/[locale]/forgot-password/ForgotPasswordForm.jsx — gửi yêu cầu quên mật khẩu. Server luôn trả cùng
// 1 câu (không cho biết email có tồn tại không), giao diện hiện câu đó theo ngôn ngữ đang dùng.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";

export default function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ status: "idle", message: null });

  async function handleSubmit(e) {
    e.preventDefault();
    setState({ status: "sending", message: null });
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("forgotError"));
      setState({ status: "sent", message: t("forgotSent") });
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-lg bg-sea-700/10 px-3 py-3 text-sm text-sea-900">
        {state.message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        id="forgot-email"
        type="email"
        label={t("email")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={state.status === "sending"} className="w-full">
        {state.status === "sending" ? t("sending") : t("sendResetLink")}
      </Button>
    </form>
  );
}
