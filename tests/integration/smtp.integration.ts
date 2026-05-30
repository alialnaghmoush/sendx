/**
 * SMTP integration test against Mailpit (localhost:1025).
 * Run locally with: docker run -p 1025:1025 -p 8025:8025 axllent/mailpit
 * Run in CI via the services block in test.yml.
 *
 * Usage: bun run tests/integration/smtp.integration.ts
 */
import { createMailer } from "../../dist/index.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Integration test failed: ${message}`);
  }
}

interface MailpitAddress {
  Address: string;
}

interface MailpitMessage {
  Subject: string;
  To: MailpitAddress[];
  Attachments: number;
}

interface MailpitListResponse {
  total: number;
  messages: MailpitMessage[];
}

// Test 1: Plain text email
const mailer = await createMailer({ host: "localhost", port: 1025 });
await mailer.send({
  from: "sender@test.com",
  to: "recipient@test.com",
  subject: "Integration test — plain text",
  text: "Hello from sently integration test",
});

const msgs = (await fetch("http://localhost:8025/api/v1/messages").then((r) =>
  r.json(),
)) as MailpitListResponse;
assert(msgs.total >= 1, "At least one message received");
assert(msgs.messages[0]?.Subject === "Integration test — plain text");
assert(msgs.messages[0]?.To[0]?.Address === "recipient@test.com");

// Test 2: HTML email with attachment
await mailer.send({
  from: "sender@test.com",
  to: "recipient@test.com",
  subject: "Integration test — HTML",
  html: "<h1>Hello</h1>",
  text: "Hello",
  attachments: [
    {
      filename: "test.txt",
      content: new TextEncoder().encode("attachment content"),
      contentType: "text/plain",
    },
  ],
});

const msgs2 = (await fetch("http://localhost:8025/api/v1/messages").then((r) =>
  r.json(),
)) as MailpitListResponse;
const htmlMsg = msgs2.messages.find((m) => m.Subject === "Integration test — HTML");
assert(Boolean(htmlMsg), "HTML message received");
assert(htmlMsg?.Attachments === 1, "Attachment present");

// Test 3: Connection pool
const poolMailer = await createMailer({
  host: "localhost",
  port: 1025,
  pool: true,
  maxConnections: 2,
});
await Promise.all([
  poolMailer.send({ from: "a@test.com", to: "b@test.com", subject: "Pool 1", text: "ok" }),
  poolMailer.send({ from: "a@test.com", to: "b@test.com", subject: "Pool 2", text: "ok" }),
]);
await poolMailer.close();

console.log("✓ All integration tests passed");
