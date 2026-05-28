// src/core/mime.ts
import { extractEmails, parseAddresses, toMIMEHeader } from "./address.js";
import { encodeBase64, encodeHeader, encodeUtf8 } from "./base64.js";
import { signDKIM } from "./dkim.js";
import type { Attachment, DKIMConfig, Envelope, MailOptions } from "./types.js";

/** Result of building a complete MIME message. */
export interface MIMEBuildResult {
  raw: Uint8Array;
  envelope: Envelope;
  messageId: string;
  size: number;
}

const CRLF = "\r\n";

/**
 * Build a complete MIME message as a Uint8Array ready for SMTP DATA.
 * When `dkim` is provided, signs the message and prepends the DKIM-Signature header.
 */
export async function buildMIME(options: MailOptions, dkim?: DKIMConfig): Promise<MIMEBuildResult> {
  const messageId = options.messageId ?? generateMessageId();
  const date = (options.date ?? new Date()).toUTCString();
  const fromAddrs = parseAddresses(options.from);
  const toAddrs = parseAddresses(options.to);
  const ccAddrs = options.cc ? parseAddresses(options.cc) : [];

  if (fromAddrs.length === 0) {
    throw new Error("Missing from address");
  }
  if (toAddrs.length === 0) {
    throw new Error("Missing to address");
  }

  const envelope: Envelope = {
    from: fromAddrs[0]?.address ?? "",
    to: [
      ...extractEmails(options.to),
      ...(options.cc ? extractEmails(options.cc) : []),
      ...(options.bcc ? extractEmails(options.bcc) : []),
    ],
  };

  const attachments = options.attachments ?? [];
  const inlineAttachments = attachments.filter((a) => a.inline || a.contentId);
  const regularAttachments = attachments.filter((a) => !a.inline && !a.contentId);

  let root = buildSimpleBody(options);

  if (inlineAttachments.length > 0) {
    const boundary = generateBoundary();
    root = {
      contentType: `multipart/related; boundary="${boundary}"`,
      content: assembleMultipart(boundary, [
        formatNestedPart(buildSimpleBody(options)),
        ...inlineAttachments.map(formatAttachmentPart),
      ]),
    };
  }

  if (regularAttachments.length > 0) {
    const boundary = generateBoundary();
    root = {
      contentType: `multipart/mixed; boundary="${boundary}"`,
      content: assembleMultipart(boundary, [
        formatNestedPart(root),
        ...regularAttachments.map(formatAttachmentPart),
      ]),
    };
  }

  const headers: string[] = [
    foldHeader("From", fromAddrs.map(toMIMEHeader).join(", ")),
    foldHeader("To", toAddrs.map(toMIMEHeader).join(", ")),
  ];

  if (ccAddrs.length > 0) {
    headers.push(foldHeader("Cc", ccAddrs.map(toMIMEHeader).join(", ")));
  }

  if (options.replyTo) {
    headers.push(
      foldHeader("Reply-To", parseAddresses(options.replyTo).map(toMIMEHeader).join(", ")),
    );
  }

  headers.push(
    foldHeader("Subject", encodeHeader(options.subject)),
    foldHeader("Date", date),
    foldHeader("Message-ID", messageId),
    "MIME-Version: 1.0",
  );

  if (options.priority === "high") {
    headers.push("X-Priority: 1", "Importance: high");
  } else if (options.priority === "low") {
    headers.push("X-Priority: 5", "Importance: low");
  }

  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      headers.push(foldHeader(key, value));
    }
  }

  headers.push(`Content-Type: ${root.contentType}`);
  if (root.contentTransferEncoding) {
    headers.push(`Content-Transfer-Encoding: ${root.contentTransferEncoding}`);
  }

  const rawText = `${headers.join(CRLF)}${CRLF}${CRLF}${root.content}`;
  let raw = encodeUtf8(rawText);

  if (dkim) {
    const { header } = await signDKIM(raw, dkim);
    const signedText = `${header}${CRLF}${rawText}`;
    raw = encodeUtf8(signedText);
  }

  return { raw, envelope, messageId, size: raw.length };
}

interface SimpleBody {
  contentType: string;
  contentTransferEncoding?: string;
  content: string;
}

function buildSimpleBody(options: MailOptions): SimpleBody {
  const hasText = Boolean(options.text);
  const hasHtml = Boolean(options.html);

  if (hasText && hasHtml) {
    const boundary = generateBoundary();
    return {
      contentType: `multipart/alternative; boundary="${boundary}"`,
      content: assembleMultipart(boundary, [
        formatSimplePart({
          contentType: "text/plain; charset=utf-8",
          contentTransferEncoding: "8bit",
          content: options.text ?? "",
        }),
        formatSimplePart({
          contentType: "text/html; charset=utf-8",
          contentTransferEncoding: "8bit",
          content: options.html ?? "",
        }),
      ]),
    };
  }

  if (hasHtml) {
    return {
      contentType: "text/html; charset=utf-8",
      contentTransferEncoding: "8bit",
      content: options.html ?? "",
    };
  }

  return {
    contentType: "text/plain; charset=utf-8",
    contentTransferEncoding: "8bit",
    content: options.text ?? "",
  };
}

function formatSimplePart(part: SimpleBody): string {
  const headers = [`Content-Type: ${part.contentType}`];
  if (part.contentTransferEncoding) {
    headers.push(`Content-Transfer-Encoding: ${part.contentTransferEncoding}`);
  }
  return `${headers.join(CRLF)}${CRLF}${CRLF}${part.content}`;
}

function formatNestedPart(part: SimpleBody): string {
  const headers = [`Content-Type: ${part.contentType}`];
  if (part.contentTransferEncoding) {
    headers.push(`Content-Transfer-Encoding: ${part.contentTransferEncoding}`);
  }
  return `${headers.join(CRLF)}${CRLF}${CRLF}${part.content}`;
}

function formatAttachmentPart(attachment: Attachment): string {
  if (!attachment.content || typeof attachment.content === "string") {
    throw new Error(`Attachment "${attachment.filename}" requires Uint8Array content`);
  }

  const headers = [
    `Content-Type: ${attachment.contentType ?? "application/octet-stream"}`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: ${attachment.inline ? "inline" : "attachment"}; filename="${attachment.filename}"`,
  ];

  if (attachment.contentId) {
    headers.push(`Content-ID: <${attachment.contentId}>`);
  }

  if (attachment.headers) {
    for (const [key, value] of Object.entries(attachment.headers)) {
      headers.push(`${key}: ${value}`);
    }
  }

  return `${headers.join(CRLF)}${CRLF}${CRLF}${encodeBase64(attachment.content)}`;
}

function assembleMultipart(boundary: string, parts: string[]): string {
  const segments = parts.map((part) => `--${boundary}${CRLF}${part}`);
  segments.push(`--${boundary}--`);
  return segments.join(CRLF);
}

function generateMessageId(): string {
  const random = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(random, (b) => b.toString(16).padStart(2, "0")).join("");
  return `<${Date.now()}.${hex}@sendx>`;
}

function generateBoundary(): string {
  const random = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(random, (b) => b.toString(16).padStart(2, "0")).join("");
  return `----sendx_${hex}`;
}

function foldHeader(name: string, value: string): string {
  const line = `${name}: ${value}`;
  if (line.length <= 76) {
    return line;
  }

  const chunks: string[] = [];
  let remaining = line;

  while (remaining.length > 76) {
    let breakAt = remaining.lastIndexOf(" ", 76);
    if (breakAt <= name.length + 1) {
      breakAt = 76;
    }
    chunks.push(remaining.slice(0, breakAt));
    remaining = ` ${remaining.slice(breakAt).trimStart()}`;
  }
  chunks.push(remaining);

  return chunks.join(`${CRLF} `);
}
