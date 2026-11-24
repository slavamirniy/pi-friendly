import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMAGE_HISTORY_LIMIT,
  IMAGE_PLACEHOLDER,
  countKeptImages,
  imageHistoryLimit,
  pruneOldImages,
} from "./image-history.mjs";

const image = (seed) => ({ type: "image", data: seed, mimeType: "image/png" });
const text = (value) => ({ type: "text", text: value });

function turns(count) {
  const messages = [];
  for (let index = 0; index < count; index += 1) {
    messages.push({ role: "user", content: [text(`Запрос ${index}`), image(`user-${index}`)] });
    messages.push({
      role: "toolResult",
      toolName: "read",
      toolCallId: `call-${index}`,
      content: [text("Скриншот"), image(`tool-${index}`)],
    });
    messages.push({ role: "assistant", content: [text(`Ответ ${index}`)] });
  }
  return messages;
}

test("old images are replaced with a text note while latest ones stay", () => {
  const messages = turns(4);
  const pruned = pruneOldImages(messages, 2);
  // Both images of the running turn plus two images from finished turns.
  assert.equal(countKeptImages(pruned), 4);
  assert.deepEqual(pruned.at(-2).content[1], image("tool-3"));
  assert.deepEqual(pruned.at(-3).content[1], image("user-3"));
  assert.deepEqual(pruned.at(-5).content[1], image("tool-2"));
  assert.deepEqual(pruned[0].content[1], { type: "text", text: IMAGE_PLACEHOLDER });
  assert.equal(pruned.length, messages.length);
  assert.equal(pruned[0].content[0].text, "Запрос 0");
});

test("pruning does not mutate the original messages", () => {
  const messages = turns(3);
  const snapshot = JSON.stringify(messages);
  pruneOldImages(messages, 1);
  assert.equal(JSON.stringify(messages), snapshot);
});

test("a limit of zero keeps only images of the running turn", () => {
  const messages = turns(2);
  const pruned = pruneOldImages(messages, 0);
  assert.equal(countKeptImages(pruned), 2);
  assert.deepEqual(pruned.at(-3).content[1], image("user-1"));
  assert.deepEqual(pruned.at(-2).content[1], image("tool-1"));
  assert.equal(pruned.filter((message) => message.content?.some?.((block) => block.type === "image")).length, 2);
});

test("screenshots read during the running turn are never dropped", () => {
  const messages = [
    { role: "user", content: [text("Посмотри на скриншот")] },
    { role: "assistant", content: [{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "a.png" } }] },
    { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [text("Скриншот"), image("shot-1")] },
    { role: "assistant", content: [{ type: "toolCall", id: "read-2", name: "read", arguments: { path: "b.png" } }] },
    { role: "toolResult", toolCallId: "read-2", toolName: "read", content: [text("Скриншот"), image("shot-2")] },
    { role: "assistant", content: [{ type: "toolCall", id: "read-3", name: "read", arguments: { path: "c.png" } }] },
    { role: "toolResult", toolCallId: "read-3", toolName: "read", content: [text("Скриншот"), image("shot-3")] },
  ];
  const pruned = pruneOldImages(messages, 1);
  assert.equal(countKeptImages(pruned), 3);
  assert.deepEqual(pruned[2].content[1], image("shot-1"));
  assert.deepEqual(pruned[4].content[1], image("shot-2"));
  assert.deepEqual(pruned[6].content[1], image("shot-3"));
});

test("all images of the newest user message survive even above the limit", () => {
  const messages = [
    { role: "user", content: [image("old")] },
    { role: "assistant", content: [text("Хорошо")] },
    {
      role: "user",
      content: [
        image("ref-1"),
        image("ref-2"),
        image("ref-3"),
        { type: "text", text: "Сделай коллаж" },
      ],
    },
  ];
  const pruned = pruneOldImages(messages, 0);
  assert.equal(countKeptImages(pruned), 3);
  assert.deepEqual(pruned[0].content[0], { type: "text", text: IMAGE_PLACEHOLDER });
  assert.deepEqual(pruned[2].content[0], image("ref-1"));
});

test("plain text, missing content and unknown roles are untouched", () => {
  const messages = [
    { role: "user", content: "Просто текст" },
    { role: "assistant", content: [text("Ответ")] },
    { role: "user", content: [{ type: "text", text: "Без картинок" }] },
    { role: "compactionSummary", summary: "Кратко", tokensBefore: 100, timestamp: 1 },
  ];
  assert.equal(pruneOldImages(messages, 0), messages);
  assert.equal(pruneOldImages(undefined), undefined);
  assert.equal(pruneOldImages(null), null);
  assert.equal(pruneOldImages([], 2).length, 0);
});

test("default limit honours the environment override", () => {
  const saved = process.env.PI_FRIENDLY_IMAGE_LIMIT;
  delete process.env.PI_FRIENDLY_IMAGE_LIMIT;
  assert.equal(imageHistoryLimit({}), DEFAULT_IMAGE_HISTORY_LIMIT);
  assert.equal(imageHistoryLimit({ imageHistory: 5 }), 5);
  assert.equal(imageHistoryLimit({ imageHistory: -1 }), DEFAULT_IMAGE_HISTORY_LIMIT);
  process.env.PI_FRIENDLY_IMAGE_LIMIT = "7";
  assert.equal(imageHistoryLimit({ imageHistory: 5 }), 7);
  if (saved === undefined) delete process.env.PI_FRIENDLY_IMAGE_LIMIT;
  else process.env.PI_FRIENDLY_IMAGE_LIMIT = saved;
});
test("an image repeated later in the history is not sent twice", async () => {
  const { DUPLICATE_IMAGE_PLACEHOLDER } = await import("./image-history.mjs");
  const messages = [
    { role: "user", content: [image("same-bytes")] },
    { role: "assistant", content: [text("Вижу")] },
    { role: "user", content: [text("Повтори"), image("same-bytes")] },
  ];
  const pruned = pruneOldImages(messages, 2);
  assert.equal(countKeptImages(pruned), 1);
  assert.deepEqual(pruned[0].content[0], { type: "text", text: DUPLICATE_IMAGE_PLACEHOLDER });
});
