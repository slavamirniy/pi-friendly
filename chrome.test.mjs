import test from "node:test";
import assert from "node:assert/strict";
import { FAVICON_COLORS, windowStatus, windowTitle } from "./web/chrome.js";

test("window status prioritizes errors, compaction, recording, work and loading", () => {
  assert.deepEqual(windowStatus({ error: "boom", busy: true }), { kind: "error", label: "Ошибка" });
  assert.deepEqual(windowStatus({ busy: true, compacting: { reason: "threshold" } }), {
    kind: "working",
    label: "Сжимаю историю…",
  });
  assert.deepEqual(windowStatus({ busy: true, voicePhase: "recording" }), { kind: "voice", label: "Записываю…" });
  assert.deepEqual(windowStatus({ busy: true }), { kind: "working", label: "Работаю…" });
  assert.deepEqual(windowStatus({ loading: true }), { kind: "loading", label: "Загружаю…" });
  assert.deepEqual(windowStatus({ done: true }), { kind: "done", label: "Готово" });
  assert.deepEqual(windowStatus({ done: false }), { kind: "idle", label: "" });
});

test("the tab title shows the status or the chat name and always names AI DIY", () => {
  assert.equal(windowTitle({ kind: "working", label: "Работаю…" }, "Сайт пекарни"), "Работаю… — AI DIY");
  assert.equal(windowTitle({ kind: "done", label: "Готово" }), "Готово — AI DIY");
  assert.equal(windowTitle({ kind: "idle", label: "" }, "Сайт пекарни"), "Сайт пекарни — AI DIY");
  assert.equal(windowTitle({ kind: "idle", label: "" }, "   "), "AI DIY");
});

test("every status has a clear favicon colour and idle keeps the plain hammer", () => {
  assert.equal(FAVICON_COLORS.idle, null);
  for (const kind of ["working", "done", "error", "voice", "loading"]) {
    assert.match(FAVICON_COLORS[kind], /^#[0-9a-f]{6}$/i, kind);
  }
});