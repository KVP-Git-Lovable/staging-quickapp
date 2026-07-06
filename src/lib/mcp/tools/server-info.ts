import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "server_info",
  title: "Server info",
  description: "Return information about this QuickApp MCP server (name, purpose, available tools).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            app: "QuickApp",
            description:
              "AI-forward field-sales automation platform. This MCP surface currently exposes connectivity/health tools; authenticated tools that read a user's retailers, visits, and orders can be added on request.",
            docs: "https://sandbox.quickapp.ai",
          },
          null,
          2,
        ),
      },
    ],
  }),
});
