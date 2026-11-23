import test from "node:test";
import assert from "node:assert/strict";
import { finalAnswerIndex, partitionAssistantParts, shouldOpenWorkPath, workPathTitle } from "./web/work-path.js";

const answer = (text) => ({ kind: "answer", text });
const thinking = (text = "думаю") => ({ kind: "thinking", text });
const tool = () => ({ kind: "tool" });
const images = () => ({ kind: "images" });
const note = (text = "не удалось") => ({ kind: "note", text });

test("the final answer is the last non-empty answer part", () => {
  assert.equal(finalAnswerIndex([thinking(), answer("Черновик"), tool(), answer("Итог")]), 3);
  assert.equal(finalAnswerIndex([answer("Итог"), answer("   ")]), 0);
  assert.equal(finalAnswerIndex([thinking(), tool()]), -1);
  assert.equal(finalAnswerIndex([]), -1);
});

test("everything except the final answer folds into the work path", () => {
  const parts = [thinking(), answer("Промежуточный текст"), tool(), images(), note(), answer("Итог")];
  assert.deepEqual(partitionAssistantParts(parts), { answer: 5, work: [0, 1, 2], extra: [3, 4] });
});

test("a turn without an answer still exposes its work, nothing is lost", () => {
  const parts = [thinking(), tool()];
  assert.deepEqual(partitionAssistantParts(parts), { answer: -1, work: [0, 1], extra: [] });
});

test("work path title counts steps with Russian plurals", () => {
  assert.equal(workPathTitle(0), "Ход работы");
  assert.equal(workPathTitle(1), "Ход работы · 1 шаг");
  assert.equal(workPathTitle(3), "Ход работы · 3 шага");
  assert.equal(workPathTitle(5), "Ход работы · 5 шагов");
  assert.equal(workPathTitle(11), "Ход работы · 11 шагов");
  assert.equal(workPathTitle(21), "Ход работы · 21 шаг");
});

test("a finished work path stays closed unless the reader opened it or one of its steps", () => {
  assert.equal(shouldOpenWorkPath({ answer: 0 }), false);
  assert.equal(shouldOpenWorkPath({ answer: 0, nestedOpen: true }), true);
  assert.equal(shouldOpenWorkPath({ answer: 0, explicit: true }), true);
  assert.equal(shouldOpenWorkPath({ answer: 0, explicit: false, nestedOpen: true }), false);
  // A turn that has no final text must show something.
  assert.equal(shouldOpenWorkPath({ answer: -1 }), true);
});
