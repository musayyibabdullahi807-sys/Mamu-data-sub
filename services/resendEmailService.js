const RESEND_EMAILS_URL = "https://api.resend.com/emails";

const isEmailConfigured = () =>
  Boolean(
    process.env.RESEND_API_KEY &&
    process.env.RESEND_FROM &&
    process.env.APP_BASE_URL
  );

const getAppBaseUrl = () => {
  const baseUrl = new URL(process.env.APP_BASE_URL);
  const isLocalhost = ["localhost", "127.0.0.1"].includes(baseUrl.hostname);

  if (baseUrl.protocol !== "https:" && !isLocalhost) {
    throw new Error("APP_BASE_URL must use HTTPS");
  }

  return baseUrl;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned HTTP ${response.status}`);
  }
};

const sendPasswordResetEmail = async ({ to, token }) => {
  const resetUrl = new URL("/reset-password.html", getAppBaseUrl());
  resetUrl.searchParams.set("token", token);
  const link = resetUrl.toString();

  await sendEmail({
    to,
    subject: "Reset your MAMU DATA SUB password",
    text: `Use this one-time link to reset your password. It expires in 30 minutes: ${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>We received a request to reset your MAMU DATA SUB password.</p><p><a href="${link}">Reset password</a></p><p>This one-time link expires in 30 minutes. If you did not request it, ignore this email.</p>`,
  });
};

const sendPasswordChangedEmail = async (to) => {
  await sendEmail({
    to,
    subject: "Your MAMU DATA SUB password was changed",
    text: "Your MAMU DATA SUB password was changed. If you did not do this, contact MAMU support immediately.",
    html: "<p>Your MAMU DATA SUB password was changed.</p><p>If you did not do this, contact MAMU support immediately.</p>",
  });
};

module.exports = {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
};
