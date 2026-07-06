import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import serverInfoTool from "./tools/server-info";

export default defineMcp({
  name: "quickapp-mcp",
  title: "QuickApp MCP",
  version: "0.1.0",
  instructions:
    "Tools for QuickApp, an AI-forward field-sales automation platform. Use `echo` to verify connectivity and `server_info` to describe this server.",
  tools: [echoTool, serverInfoTool],
});
