import CopilotPage from "@/modules/copilot/pages/CopilotPage";

/**
 * Chat section of the QuickApp AI module. Mounts the existing Copilot chat
 * surface (conversation sidebar, ticker, chat window) without the right-hand
 * utility panel; only the thread URL prefix and outer chrome differ.
 */
export default function AiChatPage() {
  return <CopilotPage basePath="/quickapp-ai/chat" embedded utilityPanel={false} />;
}
