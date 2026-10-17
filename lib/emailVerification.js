const { createEmailVerification, EMAIL_VERIFY_TTL_HOURS } = require("../services/accountService");
const { sendVerificationEmail } = require("./emailClient");

async function sendEmailVerificationLink({ userId, origin, force = false }) {
  const { token, user } = await createEmailVerification({ userId, force });
  const locale = user.preferred_language === "en" ? "en" : "vi";
  const base = (process.env.NEXT_PUBLIC_BASE_URL || origin || "").replace(/\/+$/, "");
  return sendVerificationEmail({
    to: user.email,
    name: user.full_name,
    link: `${base}/${locale}/verify-email?token=${token}`,
    locale,
    hours: EMAIL_VERIFY_TTL_HOURS,
  });
}

module.exports = { sendEmailVerificationLink };
