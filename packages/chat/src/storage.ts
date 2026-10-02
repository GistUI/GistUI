import { isChatMessage, type ThreadStorage } from "./store";

/**
 * Keeps a thread in localStorage (per browser). Reading or writing can fail (private windows,
 * quota) and what is stored may not be a thread at all, so failures are ignored (the chat simply
 * starts empty) and entries that are not messages are dropped.
 */
export function localThread(key: string, limit = 200): ThreadStorage {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) ? parsed.filter(isChatMessage) : null;
      } catch {
        return null;
      }
    },
    save(messages) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(messages.slice(-limit)));
      } catch {
        /* storage full or blocked */
      }
    },
  };
}
