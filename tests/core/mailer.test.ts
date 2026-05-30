import { describe, expect, test } from "bun:test";
import type { MailOptions, SendResult, Transport } from "../../src/core/types.js";
import { createMailer } from "../../src/mailer.js";

describe("sently/mailer", () => {
  test("createMailer wraps a custom transport", async () => {
    const transport: Transport = {
      send: async (): Promise<SendResult> => ({
        messageId: "<test@example.com>",
        accepted: ["to@example.com"],
        rejected: [],
        response: "250 OK",
        envelope: { from: "from@example.com", to: ["to@example.com"] },
      }),
    };

    const mailer = await createMailer({ transport });
    const result = await mailer.send({
      from: "from@example.com",
      to: "to@example.com",
      subject: "Test",
      text: "Body",
    } satisfies MailOptions);

    expect(result.messageId).toBe("<test@example.com>");
  });
});
