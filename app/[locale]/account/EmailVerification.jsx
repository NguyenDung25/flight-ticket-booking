"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";

export default function EmailVerification({ verified, justRegistered }) {
  const t = useTranslations("Account");
  const [state, setState] = useState({ status: "idle", message: null });

  if (verified) {
    return <p className="mt-2 text-sm text-sea-700">✓ {t("emailVerified")}</p>;
  }

  async function resend() {
    setState({ status: "sending", message: null });
    try {
      const res = await fetch("/api/users/me/verify-email", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("resendError"));
      // Chỉ báo "đã gửi" khi SMTP thật sự gửi được.
      setState(data.sent ? { status: "sent", message: t("resendSent") } : { status: "error", message: t("resendNotSent") });
    } catch (err) {
      setState({ status: "error", message: err.message });
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">{t("emailNotVerified")}</p>
      <p className="mt-1">{justRegistered ? t("emailNotVerifiedJustRegistered") : t("emailNotVerifiedHint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={resend} disabled={state.status === "sending"}>
          {state.status === "sending" ? t("resending") : t("resendLink")}
        </Button>
        {state.message && (
          <span role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-danger" : "text-sea-700"}>
            {state.message}
          </span>
        )}
      </div>
    </div>
  );
}
