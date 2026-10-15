"use client";

// app/[locale]/promotions/CopyCodeButton.jsx — sao chép mã khuyến mãi vào clipboard.

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function CopyCodeButton({ code }) {
  const t = useTranslations("Promotions");
  const [state, setState] = useState("idle"); // idle | copied | failed

  // Dự phòng khi Clipboard API không dùng được (trang mở qua http://<IP LAN>, hoặc tab không có focus).
  function legacyCopy() {
    const el = document.createElement("textarea");
    el.value = code;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      return document.execCommand("copy");
    } finally {
      document.body.removeChild(el);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      // Vẫn không chép được thì báo để khách tự chép mã đang hiển thị.
      setState(legacyCopy() ? "copied" : "failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={t("copyAria", { code })}
      className="shrink-0 rounded-lg border border-sea-700 px-3 py-1.5 text-xs font-medium text-sea-700 transition-colors hover:bg-sea-700 hover:text-white"
    >
      {state === "copied" ? t("copied") : state === "failed" ? t("copyFailed") : t("copy")}
    </button>
  );
}
