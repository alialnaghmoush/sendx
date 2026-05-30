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

  test("emoji-only subject encoded as RFC 2047", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "🎉🚀",
      text: "Hello",
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/);
  });

  test("50 recipients in to all present in envelope.to", async () => {
    const recipients = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`);
    const result = await buildMIME({
      from: "sender@example.com",
      to: recipients,
      subject: "Bulk",
      text: "Hello all",
    });

    expect(result.envelope.to).toEqual(recipients);
  });

  test("HTML body with literal CRLF sequences does not break MIME boundary", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "CRLF test",
      html: "line1\r\nline2\r\nline3",
      attachments: [
        {
          filename: "note.txt",
          content: new TextEncoder().encode("x"),
          contentType: "text/plain",
        },
      ],
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain("line1\r\nline2\r\nline3");
    expect(raw).toMatch(/------sently_[a-f0-9]+--$/);
  });

  test("zero-byte attachment produces valid base64 with empty content", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Empty attachment",
      text: "See attached",
      attachments: [
        {
          filename: "empty.bin",
          content: new Uint8Array(0),
          contentType: "application/octet-stream",
        },
      ],
    });

    const raw = decodeUtf8(result.raw);
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    expect(raw).toMatch(
      /Content-Disposition: attachment; filename="empty.bin"\r\n\r\n\r\n------sently_/,
    );
  });

  const baseMail = {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "hi",
    text: "body",
  } as const;

  test("CRLF injection in recipient address is rejected (fail closed)", async () => {
    await expect(
      buildMIME({
        ...baseMail,
        to: { address: "victim@x.com\r\nBcc: attacker@evil.com" },
      }),
    ).rejects.toThrow(/control character/i);
  });

  test("CRLF injection rejected consistently across To/Cc/Bcc/Reply-To/From", async () => {
    const evil = "x@y.com\r\nBcc: attacker@evil.com";

    await expect(buildMIME({ ...baseMail, from: evil })).rejects.toThrow(/control character/i);
    await expect(buildMIME({ ...baseMail, to: evil })).rejects.toThrow(/control character/i);
    await expect(buildMIME({ ...baseMail, cc: evil })).rejects.toThrow(/control character/i);
    await expect(buildMIME({ ...baseMail, bcc: evil })).rejects.toThrow(/control character/i);
    await expect(buildMIME({ ...baseMail, replyTo: evil })).rejects.toThrow(/control character/i);
  });

  test("CRLF injection via display name is rejected (not collapsed)", async () => {
    await expect(
      buildMIME({
        ...baseMail,
        to: { name: "Foo\r\nBcc: attacker@evil.com", address: "victim@x.com" },
      }),
    ).rejects.toThrow(/control character/i);
  });

  test("bare LF and NUL bytes in address are rejected", async () => {
    await expect(buildMIME({ ...baseMail, to: { address: "a@b.com\nx" } })).rejects.toThrow(
      /control character/i,
    );
    await expect(buildMIME({ ...baseMail, to: { address: "a\u0000@b.com" } })).rejects.toThrow(
      /control character/i,
    );
  });

  test("address with trailing newline is rejected, never repaired-and-accepted", async () => {
    await expect(
      buildMIME({ ...baseMail, to: { address: "john@example.com\r\n" } }),
    ).rejects.toThrow(/control character/i);
  });

  test("structurally malformed (but control-char-free) address throws format error", async () => {
    await expect(
      buildMIME({ ...baseMail, to: { address: "not-an-email" } }),
    ).rejects.toThrow(/Invalid email address/);
  });

  test("CRLF injection in attachment filename is sanitized", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "attach",
      text: "See attached",
      attachments: [
        {
          filename: 'note.txt"\r\nBcc: attacker@evil.com',
          content: new TextEncoder().encode("x"),
          contentType: "text/plain",
        },
      ],
    });

    const raw = decodeUtf8(result.raw);
    // CRLF is collapsed to a space, so no injected header line is created.
    expect(raw).not.toContain("\r\nBcc: attacker@evil.com");
    expect(raw).not.toMatch(/filename="[^"]*\r\n/);
  });

  test("CRLF injection in custom attachment headers is sanitized", async () => {
    const result = await buildMIME({
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "attach",
      text: "See attached",
      attachments: [
        {
          filename: "note.txt",
          content: new TextEncoder().encode("x"),
          contentType: "text/plain",
          headers: { "X-Custom": "value\r\nBcc: attacker@evil.com" },
        },
      ],
    });

    const raw = decodeUtf8(result.raw);
    // CRLF is collapsed to a space, so no injected header line is created.
    expect(raw).not.toContain("\r\nBcc: attacker@evil.com");
    expect(raw).toContain("X-Custom: value Bcc: attacker@evil.com");
  });
});
