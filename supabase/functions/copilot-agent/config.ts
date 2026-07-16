// Central config for the Copilot agent. Change MODEL here to swap Together.ai models.
// NOTE: Do NOT use `openai/gpt-oss-*` here. Those models stream a long private
// `reasoning` phase before any `content` token, so the chat UI shows only
// typing dots for many seconds and users perceive the request as hung.
// Llama 3.3 70B Turbo starts emitting content tokens immediately.
export const MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
export const TOGETHER_URL = "https://api.together.ai/v1/chat/completions";
export const MAX_INPUT_CHARS = 4000;
export const MAX_OUTPUT_TOKENS = 4096;
export const HISTORY_LIMIT = 30;
export const APP_NAME = "QuickApp";
