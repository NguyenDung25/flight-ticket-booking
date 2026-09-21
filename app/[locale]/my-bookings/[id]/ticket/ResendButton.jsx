"use client";

// app/[locale]/my-bookings/[id]/ticket/ResendButton.jsx
//
// C7 — gọi ?resend=true TƯỜNG MINH (xem comment issueTicket trong
// services/ticketService.js: mặc định route KHÔNG gửi lại email mỗi lần
// khách chỉ mở trang xem vé, chỉ gửi khi bấm đúng nút này).

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";

export default function ResendButton({ bookingId }) {
  const t = useTranslations("Ticket");
  const [state, setState] = useState("idle"); // idle | sending | sent | error

  async function handleResend() {
    setState("sending");
    try {
      const res = await fetch(`/api/bookings/${bookingId}/ticket?resend=true`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || t("resendError"));
      }
      // emailSent có thể vẫn false nếu SMTP lỗi (issueTicket KHÔNG ném lỗi
      // trong trường hợp đó, xem comment gốc) — phân biệt rõ 2 trạng thái
      // thay vì gộp chung "đã gửi" khi thực ra chỉ là request thành công.
      setState(data.email_sent ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={handleResend} disabled={state === "sending"}>
        {state === "sending" ? t("resending") : t("resendButton")}
      </Button>
      {state === "sent" && <p className="text-xs text-sea-700">{t("resendSuccess")}</p>}
      {state === "error" && <p className="text-xs text-danger">{t("resendError")}</p>}
    </div>
  );
}
