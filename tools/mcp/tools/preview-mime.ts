import type { MailOptions } from "../../../src/core/types.js";
import { buildMIME } from "../../../src/core/mime.js";
import { decodeUtf8 } from "../../../src/core/base64.js";

/**
 * Build and return the raw MIME message without sending.
 */
export async function previewMime(input: MailOptions) {
  const result = await buildMIME(input);
  return {
    raw: decodeUtf8(result.raw),
    size: result.size,
    messageId: result.messageId,
    envelope: result.envelope,
  };
}

export const previewMimeSchema = {
  type: "object",
  properties: {
    from: {},
    to: {},
    subject: { type: "string" },
    text: { type: "string" },
    html: { type: "string" },
  },
  required: ["from", "to", "subject"],
} as const;
