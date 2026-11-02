import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSupportEmail } from "@/lib/supportContact";

// Số tổng đài chỉ là số giả để minh họa; hòm thư hỗ trợ lấy từ cấu hình email của dự án.
const HOTLINE = "1900 1234";

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  className: "mt-0.5 shrink-0 text-ink",
};

function PhoneIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ContactRow({ icon, label, children }) {
  return (
    <li className="flex items-start gap-3">
      {icon}
      <span>
        {label}: <span className="font-semibold text-ink">{children}</span>
      </span>
    </li>
  );
}

export default async function Footer() {
  const [t, tNav, tSupport] = await Promise.all([
    getTranslations("Brand"),
    getTranslations("Nav"),
    getTranslations("Support"),
  ]);
  const year = new Date().getFullYear();
  const supportEmail = getSupportEmail();

  return (
    <footer className="border-t border-sand-100 bg-white py-8 text-sm text-ink/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6">
        <section aria-labelledby="support-title" className="flex flex-col gap-3">
          <h2 id="support-title" className="font-display text-xl font-semibold text-ink">
            {tSupport("title")}
          </h2>
          <div className="rounded-2xl bg-sand-50 p-5 sm:p-6">
            <ul className="grid gap-4 lg:grid-cols-3">
              <ContactRow icon={<PhoneIcon />} label={tSupport("hotline")}>
                <a href={`tel:${HOTLINE.replace(/\s/g, "")}`} className="hover:text-coral-600">
                  {HOTLINE}
                </a>
              </ContactRow>
              {supportEmail && (
                <ContactRow icon={<MailIcon />} label={tSupport("email")}>
                  <a href={`mailto:${supportEmail}`} className="break-all hover:text-coral-600">
                    {supportEmail}
                  </a>
                </ContactRow>
              )}
              <ContactRow icon={<ClockIcon />} label={tSupport("hours")}>
                {tSupport("hoursValue")}
              </ContactRow>
            </ul>
            <p className="mt-4 text-xs text-ink/60">{tSupport("note")}</p>
          </div>
        </section>

        <div className="flex flex-col gap-3 border-t border-sand-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="font-bold text-ink">{t("name")}</span> · {t("tagline")} · © {year}
          </span>
          <nav aria-label={t("name")} className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/promotions" className="hover:text-coral-600">
              {tNav("promotions")}
            </Link>
            <Link href="/cancellation-policy" className="hover:text-coral-600">
              {tNav("cancellationPolicy")}
            </Link>
            <Link href="/check-in" className="hover:text-coral-600">
              {tNav("checkIn")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
