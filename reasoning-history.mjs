// The current turn keeps all of its reasoning. In older turns the model does not need its own
// earlier deliberation: the newest turns are sent whole, the rest are shortened to their first
// characters, and the work itself (texts, tool calls) stays untouched on disk and in the chat.

import { currentTurnStart, shortenHead } from "./turn-history.mjs";

export const DEFAULT_REASONING_HISTORY_LIMIT = 15;
export const DEFAULT_REASONING_HEAD_CHARS = 1000;
export const REASONING_NOTE = "размышление сокращено, остались первые символы";

export function reasoningHistoryLimit(prefs) {
  const env = String(process.env.PI_FRIENDLY_REASONING_HISTORY ?? "").trim();
  const raw = Number(env !== "" ? env : prefs?.reasoningHistory);
  if (Number.isInteger(raw) && raw >= 0 && raw <= 200) return raw;
  return DEFAULT_REASONING_HISTORY_LIMIT;
}

export function reasoningHeadChars(prefs) {
  const env = String(process.env.PI_FRIENDLY_REASONING_HEAD ?? "").trim();
  const raw = Number(env !== "" ? env : prefs?.reasoningHeadChars);
  if (Number.isInteger(raw) && raw >= 100 && raw <= 100_000) return raw;
  return DEFAULT_REASONING_HEAD_CHARS;
}

const thinkingBlocks = (message) =>
  Array.isArray(message?.content) ? message.content.filter((block) => block?.type === "thinking") : [];

const nonEmptyThinking = (message) => thinkingBlocks(message).some((block) => String(block.thinking || "").trim());

// `keep` counts assistant messages with reasoning, newest first, among the turns that are
// already finished. Returns the original array when nothing changes.
export function pruneOldReasoning(messages, keep = DEFAULT_REASONING_HISTORY_LIMIT, options = {}) {
  if (!Array.isArray(messages)) return messages;
  // Anthropic replays signed thinking blocks verbatim; touching them breaks the request.
  if (options.strictSignatures === true) return messages;
  const limit = Number.isInteger(keep) && keep >= 0 ? keep : DEFAULT_REASONING_HISTORY_LIMIT;
  const head = Number.isInteger(options.headChars) && options.headChars > 0 ? options.headChars : DEFAULT_REASONING_HEAD_CHARS;
  const turnStart = currentTurnStart(messages);
  const finished = [];
  messages.forEach((message, index) => {
    if (index < turnStart && message?.role === "assistant" && nonEmptyThinking(message)) finished.push(index);
  });
  const stale = new Set(finished.slice(0, Math.max(0, finished.length - limit)));
  if (!stale.size) return messages;
  let changed = false;
  const next = messages.map((message, index) => {
    if (!stale.has(index)) return message;
    let touched = false;
    const content = message.content.map((block) => {
      if (block?.type !== "thinking") return block;
      const text = String(block.thinking || "");
      if (Array.from(text).length <= head) return block;
      touched = true;
      return { ...block, thinking: shortenHead(text, head, REASONING_NOTE) };
    });
    if (!touched) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? next : messages;
}
