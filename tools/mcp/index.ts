import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { checkSmtp } from "./tools/check-smtp.js";
import { previewMime } from "./tools/preview-mime.js";
import { sendTestEmail } from "./tools/send-test.js";
import { validateConfig } from "./tools/validate-config.js";

const server = new Server(
  { name: "sendx", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_test_email",
      description: "Send a test email using any sendx config and return the result",
      inputSchema: {
        type: "object",
        properties: {
          config: { type: "object", description: "SMTP connection config" },
          to: { type: "string", description: "Recipient address" },
          subject: { type: "string", description: 'Default: "sendx test email"' },
        },
        required: ["config", "to"],
      },
    },
    {
      name: "preview_mime",
      description:
        "Build and return the raw MIME message for any MailOptions — no email is sent",
      inputSchema: {
        type: "object",
        properties: {
          from: {},
          to: {},
          subject: { type: "string" },
          text: { type: "string" },
          html: { type: "string" },
          cc: {},
          bcc: {},
          attachments: { type: "array" },
        },
        required: ["from", "to", "subject"],
      },
    },
    {
      name: "check_smtp",
      description: "Test connectivity and authentication against an SMTP server without sending mail",
      inputSchema: {
        type: "object",
        properties: {
          host: { type: "string" },
          port: { type: "number" },
          auth: { type: "object" },
          secure: { type: "boolean" },
        },
        required: ["host", "port"],
      },
    },
    {
      name: "validate_config",
      description: "Validate a createMailer config and return errors and warnings",
      inputSchema: { type: "object" },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "send_test_email": {
      const result = await sendTestEmail(args as Parameters<typeof sendTestEmail>[0]);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "preview_mime": {
      const result = await previewMime(args as Parameters<typeof previewMime>[0]);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "check_smtp": {
      const result = await checkSmtp(args as Parameters<typeof checkSmtp>[0]);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "validate_config": {
      const result = validateConfig(args as Parameters<typeof validateConfig>[0]);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
