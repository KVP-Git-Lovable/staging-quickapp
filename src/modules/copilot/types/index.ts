export type MessageRole = "user" | "assistant" | "system";

export interface CopilotConversation {
  id: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
}

export interface CopilotMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  /** Client-only: message is currently streaming from the server. */
  streaming?: boolean;
}

export interface PromptCard {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
}
