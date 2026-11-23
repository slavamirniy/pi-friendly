import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  DEFAULT_TEXT_HEAD_CHARS,
  DEFAULT_TEXT_HISTORY_LIMIT,
  pruneOldToolTexts,
  textHeadChars,
  textHistoryLimit,
} from "./text-history.mjs";

const long = (marker) => marker + " " + "строка текста ".repeat(400);
const toolCall = (id, name, args) => ({ role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] });
const toolResult = (id, name, text) => ({ role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text }] });

function history(count) {
  const messages = [];
  for (let index = 0; index < count; index += 1) {
    messages.push(toolCall(`call-${index}`, "read", { path: `src/file-${index}.js` }));
    messages.push(toolResult(`call-${index}`, "read", long(`ФАЙЛ-${index}`)));
  }
  return messages;
}

test("the newest long outputs stay intact and older ones keep only their head and a file note", () => {
  const cwd = process.cwd();
  const messages = history(20);
  const pruned = pruneOldToolTexts(messages, 15, 1000, cwd);
  const results = pruned.filter((message) => message.role === "toolResult");
  assert.equal(results.length, 20);
  // The last 15 are untouched.
  for (let index = 5; index < 20; index += 1) {
    assert.equal(results[index].content[0].text, long(`ФАЙЛ-${index}`));
  }
  // Older ones start with the first 1000 characters and point at the file.
  const shortened = results[0].content[0].text;
  assert.equal(Array.from(shortened).slice(0, 1000).join(""), Array.from(long("ФАЙЛ-0")).slice(0, 1000).join("").trimEnd());
  assert.match(shortened, /выдача была сокращена, был прочитан файл /);
  assert.ok(shortened.endsWith(resolve(cwd, "src/file-0.js")));
  assert.ok(shortened.length < long("ФАЙЛ-0").length);
});

test("short outputs are never shortened and do not consume the budget", () => {
  const messages = [];
  for (let index = 0; index < 20; index += 1) messages.push(toolResult(`short-${index}`, "write", `Wrote ${index} bytes`));
  messages.push(toolCall("read-1", "read", { path: "a.js" }), toolResult("read-1", "read", long("ДЛИННЫЙ")));
  const pruned = pruneOldToolTexts(messages, 1, 1000, process.cwd());
  assert.equal(pruned, messages);
});

test("console output keeps the command in the note", () => {
  const messages = [
    { role: "assistant", content: [{ type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "npm test" } }] },
    toolResult("bash-1", "bash", long("ВЫВОД")),
    { role: "assistant", content: [{ type: "toolCall", id: "bash-2", name: "bash", arguments: { command: "ls" } }] },
    toolResult("bash-2", "bash", long("СВЕЖИЙ")),
  ];
  const pruned = pruneOldToolTexts(messages, 1, 1000, process.cwd());
  assert.match(pruned[1].content[0].text, /выдача была сокращена, консольная команда: npm test/);
  assert.equal(pruned[3].content[0].text, long("СВЕЖИЙ"));
});

test("bashExecution messages shorten their output field", () => {
  const messages = [
    { role: "bashExecution", command: "dir", output: long("СТАРОЕ"), timestamp: 1 },
    { role: "bashExecution", command: "pwd", output: long("НОВОЕ"), timestamp: 2 },
  ];
  const pruned = pruneOldToolTexts(messages, 1, 1000, process.cwd());
  assert.match(pruned[0].output, /выдача была сокращена, консольная команда: dir/);
  assert.equal(pruned[1].output, long("НОВОЕ"));
});

test("images in a tool result survive text shortening", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "scan-1",
      toolName: "read",
      content: [
        { type: "text", text: long("ОПИСАНИЕ") },
        { type: "image", data: "AAAA", mimeType: "image/png" },
      ],
    },
    { role: "toolResult", toolCallId: "scan-2", toolName: "read", content: [{ type: "text", text: long("НОВОЕ") }] },
  ];
  const pruned = pruneOldToolTexts(messages, 1, 1000, process.cwd());
  assert.equal(pruned[0].content.length, 2);
  assert.equal(pruned[0].content[0].type, "text");
  assert.equal(pruned[0].content[1].type, "image");
  assert.match(pruned[0].content[0].text, /выдача была сокращена/);
});

test("the original messages are not mutated", () => {
  const messages = history(3);
  const snapshot = JSON.stringify(messages);
  pruneOldToolTexts(messages, 0, 100);
  assert.equal(JSON.stringify(messages), snapshot);
  assert.equal(pruneOldToolTexts(undefined, 1), undefined);
  assert.equal(pruneOldToolTexts(null, 1), null);
});

test("limits come from the environment and preferences", () => {
  const saved = { history: process.env.PI_FRIENDLY_TEXT_HISTORY, head: process.env.PI_FRIENDLY_TEXT_HEAD };
  delete process.env.PI_FRIENDLY_TEXT_HISTORY;
  delete process.env.PI_FRIENDLY_TEXT_HEAD;
  assert.equal(textHistoryLimit({}), DEFAULT_TEXT_HISTORY_LIMIT);
  assert.equal(textHeadChars({}), DEFAULT_TEXT_HEAD_CHARS);
  assert.equal(textHistoryLimit({ textHistory: 4 }), 4);
  assert.equal(textHeadChars({ textHeadChars: 2000 }), 2000);
  assert.equal(textHistoryLimit({ textHistory: -1 }), DEFAULT_TEXT_HISTORY_LIMIT);
  process.env.PI_FRIENDLY_TEXT_HISTORY = "3";
  process.env.PI_FRIENDLY_TEXT_HEAD = "500";
  assert.equal(textHistoryLimit({ textHistory: 4 }), 3);
  assert.equal(textHeadChars({ textHeadChars: 2000 }), 500);
  if (saved.history === undefined) delete process.env.PI_FRIENDLY_TEXT_HISTORY;
  else process.env.PI_FRIENDLY_TEXT_HISTORY = saved.history;
  if (saved.head === undefined) delete process.env.PI_FRIENDLY_TEXT_HEAD;
  else process.env.PI_FRIENDLY_TEXT_HEAD = saved.head;
});