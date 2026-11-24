import test from "node:test";
import assert from "node:assert/strict";
import { currentTurnStart, shortenHead } from "./turn-history.mjs";

test("the running turn starts at the newest user message", () => {
  const messages = [
    { role: "user" },
    { role: "assistant" },
    { role: "toolResult" },
    { role: "user" },
    { role: "assistant" },
    { role: "toolResult" },
  ];
  assert.equal(currentTurnStart(messages), 3);
});

test("without a user message nothing is protected", () => {
  const messages = [{ role: "assistant" }, { role: "toolResult" }];
  assert.equal(currentTurnStart(messages), messages.length);
  assert.equal(currentTurnStart(undefined), 0);
  assert.equal(currentTurnStart([]), 0);
});

test("shortened text keeps the first characters and the note", () => {
  assert.equal(shortenHead("привет мир", 100, "сокращено"), "привет мир\n\nсокращено");
  assert.equal(shortenHead("привет мир", 6, "сокращено"), "привет\n\nсокращено");
  assert.equal(shortenHead(undefined, 4, "сокращено"), "\n\nсокращено");
});
