"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import { localizeApiMessage, currentUiLocale } from "@/lib/apiMessages";

export default function ResendButton({ bookingId }) {
  const t = useTranslations("Ticket");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [errorText, setErrorText] = useState(null);

  async function handleResend() {
    setState("sending");
    setErrorText(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/ticket?resend=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(localizeApiMessage(data.message, currentUiLocale()) || t("resendError"));
      }
      // emailSent có thể vẫn false nếu SMTP lỗi (issueTicket không ném lỗi trong trường hợp đó).
      setState(data.email_sent ? "sent" : "error");
    } catch (err) {
      setErrorText(err.message);
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={handleResend} disabled={state === "sending"}>
        {state === "sending" ? t("resending") : t("resendButton")}
      </Button>
      {state === "sent" && <p className="text-xs text-sea-700">{t("resendSuccess")}</p>}
      {state === "error" && <p className="text-xs text-danger">{errorText || t("resendError")}</p>}
    </div>
  );
}
