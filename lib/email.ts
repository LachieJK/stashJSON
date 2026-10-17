import { env } from "@/lib/env";

export type Email = { to: string; subject: string; text: string };

const RESEND_URL = "https://api.resend.com/emails";

/**
 * Build the outbound mail transport. With a Resend key it posts to Resend's
 * HTTP API and throws on a non-2xx answer; without one (dev, Vitest) it prints
 * the whole message to the server log, so a reset link can be followed locally
 * without a mail provider.
 */
export function createEmailSender({
  apiKey,
  from,
}: {
  apiKey?: string;
  from: string;
}): (email: Email) => Promise<void> {
  if (!apiKey) {
    return async ({ to, subject, text }) => {
      console.info(
        `[email] To: ${to}\nFrom: ${from}\nSubject: ${subject}\n\n${text}`,
      );
    };
  }

  return async ({ to, subject, text }) => {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      throw new Error(`Resend refused the email (${res.status}): ${await res.text()}`);
    }
  };
}

export const sendEmail = createEmailSender({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
});
