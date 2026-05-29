import type { SMTPAuth, SMTPConfig } from "../../../src/core/types.js";
import { createMailer } from "../../../src/index.js";

export interface SendTestInput {
  config: SMTPConfig;
  to: string;
  subject?: string;
}

/**
 * Send a test email using any sently SMTP config.
 */
export async function sendTestEmail(input: SendTestInput) {
  try {
    const mailer = await createMailer(input.config);
    const from = input.config.auth?.user ?? "test@sently.dev";
    const result = await mailer.send({
      from,
      to: input.to,
      subject: input.subject ?? "sently test email",
      text: "This is a test email sent by the sently MCP tool.",
    });
    await mailer.close();
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
