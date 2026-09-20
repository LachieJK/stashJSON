import { env } from "@/lib/env";

/**
 * Outbound transactional email — today only the password-reset link
 * (lib/betterAuth.ts). Plain text only: these messages carry a link and a
 * sentence, and a text body is the one shape every client renders the same.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type SendEmail = (message: EmailMessage) => Promise<void>;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Build a sender. With an API key it delivers through Resend's HTTP API over
 * raw `fetch` — no SDK, since one endpoint doesn't earn a dependency. Without
 * one it prints the whole message, link included, to the server log: that is
 * how a reset link is followed in dev and under Vitest.
 *
 * A factory rather than a module-level branch so tests can build both paths
 * without re-parsing lib/env.
 */
export function createEmailSender({
  apiKey,
  from,
}: {
  apiKey?: string;
  from: string;
}): SendEmail {
  if (!apiKey) {
    return async (message) => {
      // eslint-disable-next-line no-console
      console.info(
        [
          "[email] RESEND_API_KEY is unset — printing instead of sending",
          `From: ${from}`,
          `To: ${message.to}`,
          `Subject: ${message.subject}`,
          "",
          message.text,
        ].join("\n"),
      );
    };
  }

  return async (message) => {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!res.ok) {
      // Resend's error body is `{ message }`; surface it, but never the key.
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Resend refused the email (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }
  };
}

export const sendEmail: SendEmail = createEmailSender({
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
});
