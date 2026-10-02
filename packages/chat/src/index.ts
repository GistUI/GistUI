/**
 * `@gistui/chat`: a headless chat store, model adapters and thread storage (no framework). React
 * layouts are in `@gistui/chat/react`, styles in `@gistui/chat/chat.css`.
 */

export {
  ChatStore,
  createChat,
  requestHistory,
  wrapUiMessage,
  type ChatAdapter,
  type ChatMessage,
  type ChatOptions,
  type ChatRequest,
  type ChatRole,
  type ChatSnapshot,
  type SendOptions,
  type ThreadStorage,
} from "./store";
export { agui, aiSdk, anthropic, openai, textStream } from "./adapters";
export { localThread } from "./storage";
export { replyProgram, splitReply, type ReplyPart, type SplitOptions } from "./split";
