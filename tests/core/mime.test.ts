import { describe, expect, test } from "bun:test";
import { decodeUtf8, encodeBase64 } from "../../src/core/base64.js";
import { buildMIME } from "../../src/core/mime.js";

function derToPem(der: ArrayBuffer): string {
  const b64 = encodeBase64(new Uint8Array(der)).replace(/\r\n/g, "");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

describe("buildMIME", () => {
  test("text only", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Hello",
      text: "Plain text body",
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toContain("Content-Type: text/plain");
    expect(raw).toContain("Plain text body");
    expect(result.envelope.from).toBe("sender@example.com");
    expect(result.envelope.to).toEqual(["recipient@example.com"]);
  });

  test("html only", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Hello",
      html: "<p>HTML body</p>",
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toContain("Content-Type: text/html");
    expect(raw).toContain("<p>HTML body</p>");
  });

  test("text and html alternative", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Hello",
      text: "Plain",
      html: "<p>HTML</p>",
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("Plain");
    expect(raw).toContain("<p>HTML</p>");
  });

  test("inline image", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Inline",
      html: '<img src="cid:logo">',
      attachments: [
        {
          filename: "logo.png",
          content: new Uint8Array([137, 80, 78, 71]),
          contentType: "image/png",
          contentId: "logo",
          inline: true,
        },
      ],
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toContain("multipart/related");
    expect(raw).toContain("Content-ID: <logo>");
  });

  test("file attachment", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Attachment",
      text: "See attached",
      attachments: [
        {
          filename: "doc.pdf",
          content: new Uint8Array([37, 80, 68, 70]),
          contentType: "application/pdf",
        },
      ],
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain('filename="doc.pdf"');
  });

  test("Arabic subject encoded", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "مرحبا",
      text: "Hello",
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
  });

  test("BCC in envelope but not in headers", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "visible@example.com",
      cc: "cc@example.com",
      bcc: "hidden@example.com",
      subject: "BCC test",
      text: "Secret copy",
    });

    const raw = decodeUtf8(result.raw);
    expect(result.envelope.to).toEqual([
      "visible@example.com",
      "cc@example.com",
      "hidden@example.com",
    ]);
    expect(raw).toContain("To: visible@example.com");
    expect(raw).toContain("Cc: cc@example.com");
    expect(raw).not.toContain("Bcc:");
    expect(raw).not.toContain("hidden@example.com");
  });

  test("prepends DKIM-Signature when dkim config provided", async () => {
    const { privateKey } = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const privatePem = derToPem(await crypto.subtle.exportKey("pkcs8", privateKey));

    const result = await buildMIME(
      {
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Signed",
        text: "Body",
      },
      {
        domainName: "example.com",
        keySelector: "test",
        privateKey: privatePem,
        headerFieldNames: "from:to:subject",
      },
    );

    const raw = decodeUtf8(result.raw);
    expect(raw.startsWith("DKIM-Signature:")).toBe(true);
  });
});
