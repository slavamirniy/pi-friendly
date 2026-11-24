import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REASONING_HEAD_CHARS,
  DEFAULT_REASONING_HISTORY_LIMIT,
  REASONING_NOTE,
  pruneOldReasoning,
  reasoningHeadChars,
  reasoningHistoryLimit,
} from "./reasoning-history.mjs";

const thinking = (value) => ({ type: "thinking", thinking: value, thinkingSignature: "reasoning_content" });
const text = (value) => ({ type: "text", text: value });
const call = (value) => ({ type: "toolCall", id: value, name: "bash", arguments: {} });
const reasoning = (marker) => `${marker} ${"рассуждение ".repeat(200)}`;

function turns(count) {
  const messages = [];
  for (let index = 0; index < count; index += 1) {
    messages.push({ role: "user", content: [text(`Запрос ${index}`)] });
    messages.push({ role: "assistant", content: [thinking(reasoning(`Думаю ${index}`)), text(`Ответ ${index}`), call(`call-${index}`)] });
    messages.push({ role: "toolResult", toolCallId: `call-${index}`, content: [text("Готово")] });
  }
  return messages;
}

const reasoningText = (message) => message.content.filter((block) => block.type === "thinking").map((block) => block.thinking).join("");
const whole = (message) => !reasoningText(message).includes(REASONING_NOTE);

test("the running turn keeps all of its reasoning", () => {
  const messages = turns(2);
  const pruned = pruneOldReasoning(messages, 0, { headChars: 1000 });
  // The last turn is still being worked on: untouched.
  assert.deepEqual(pruned.at(-2).content[0], thinking(reasoning("Думаю 1")));
  // The finished turn is shortened but keeps its first characters and its tool calls.
  assert.ok(pruned[1].content[0].thinking.startsWith(Array.from(reasoning("Думаю 0")).slice(0, 1000).join("").trimEnd()));
  assert.match(pruned[1].content[0].thinking, new RegExp(REASONING_NOTE));
  assert.equal(pruned[1].content[1].type, "text");
  assert.equal(pruned[1].content[2].type, "toolCall");
  assert.equal(pruned.length, messages.length);
});

test("only the newest finished turns keep their reasoning whole", () => {
  const messages = turns(8);
  const pruned = pruneOldReasoning(messages, 3, { headChars: 1000 });
  const assistants = pruned.filter((message) => message.role === "assistant");
  // 8 turns: the running one plus the last three finished ones stay whole.
  assert.deepEqual(assistants.slice(-4).map(whole), [true, true, true, true]);
  assert.deepEqual(assistants.slice(0, 4).map(whole), [false, false, false, false]);
});

test("short reasoning is never touched", () => {
  const messages = [
    { role: "user", content: [text("Привет")] },
    { role: "assistant", content: [thinking("Коротко"), text("Ответ")] },
    { role: "user", content: [text("Ещё")] },
    { role: "assistant", content: [thinking("Тоже коротко"), text("Ответ")] },
  ];
  const pruned = pruneOldReasoning(messages, 0, { headChars: 1000 });
  assert.equal(pruned[1].content[0].thinking, "Коротко");
});

test("a turn made only of reasoning keeps its text", () => {
  const messages = [
    { role: "user", content: [text("Запрос")] },
    { role: "assistant", content: [thinking(reasoning("Только размышление"))] },
    { role: "user", content: [text("Дальше")] },
  ];
  const pruned = pruneOldReasoning(messages, 0, { headChars: 1000 });
  assert.equal(pruned[1].content.length, 1);
  assert.equal(pruned[1].content[0].type, "thinking");
  assert.ok(pruned[1].content[0].thinking.length > 0);
});

test("strict signature providers keep their reasoning untouched", () => {
  const messages = turns(5);
  assert.equal(pruneOldReasoning(messages, 0, { strictSignatures: true }), messages);
});

test("pruning does not mutate the original messages", () => {
  const messages = turns(3);
  const snapshot = JSON.stringify(messages);
  pruneOldReasoning(messages, 0, { headChars: 500 });
  assert.equal(JSON.stringify(messages), snapshot);
  assert.equal(pruneOldReasoning(undefined), undefined);
});

test("limits come from the environment and preferences", () => {
  const saved = { history: process.env.PI_FRIENDLY_REASONING_HISTORY, head: process.env.PI_FRIENDLY_REASONING_HEAD };
  delete process.env.PI_FRIENDLY_REASONING_HISTORY;
  delete process.env.PI_FRIENDLY_REASONING_HEAD;
  assert.equal(reasoningHistoryLimit({}), DEFAULT_REASONING_HISTORY_LIMIT);
  assert.equal(reasoningHistoryLimit({ reasoningHistory: 0 }), 0);
  assert.equal(reasoningHistoryLimit({ reasoningHistory: -1 }), DEFAULT_REASONING_HISTORY_LIMIT);
  assert.equal(reasoningHistoryLimit({ reasoningHistory: 300 }), DEFAULT_REASONING_HISTORY_LIMIT);
  assert.equal(reasoningHeadChars({}), DEFAULT_REASONING_HEAD_CHARS);
  assert.equal(reasoningHeadChars({ reasoningHeadChars: 2000 }), 2000);
  assert.equal(reasoningHeadChars({ reasoningHeadChars: 10 }), DEFAULT_REASONING_HEAD_CHARS);
  process.env.PI_FRIENDLY_REASONING_HISTORY = "2";
  process.env.PI_FRIENDLY_REASONING_HEAD = "1500";
  assert.equal(reasoningHistoryLimit({ reasoningHistory: 9 }), 2);
  assert.equal(reasoningHeadChars({ reasoningHeadChars: 2000 }), 1500);
  if (saved.history === undefined) delete process.env.PI_FRIENDLY_REASONING_HISTORY;
  else process.env.PI_FRIENDLY_REASONING_HISTORY = saved.history;
  if (saved.head === undefined) delete process.env.PI_FRIENDLY_REASONING_HEAD;
  else process.env.PI_FRIENDLY_REASONING_HEAD = saved.head;
});
