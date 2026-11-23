import test from "node:test";
import assert from "node:assert/strict";
import { FAVICON_COLORS, TITLE_CHARS, chatTitle, windowStatus, windowTitle } from "./web/chrome.js";

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

test("the tab title is just the status, without the product name", () => {
  assert.equal(windowTitle({ kind: "working", label: "Работаю…" }, "Сайт пекарни"), "Работаю…");
  assert.equal(windowTitle({ kind: "done", label: "Готово" }), "Готово");
  assert.equal(windowTitle({ kind: "error", label: "Ошибка" }), "Ошибка");
});

test("an idle tab shows the chat name, at most 15 characters", () => {
  assert.equal(TITLE_CHARS, 15);
  assert.equal(windowTitle({ kind: "idle", label: "" }, "Меню и контакты"), "Меню и контакты");
  assert.equal(windowTitle({ kind: "idle", label: "" }, "Сделай главную страницу для пекарни"), "Сделай главную…");
  assert.equal(chatTitle("  Много   пробелов  "), "Много пробелов");
  assert.equal(chatTitle("Ровно пятнадцат"), "Ровно пятнадцат");
  assert.equal(chatTitle("Ровно пятнадцать"), "Ровно пятнадцат…");
});

test("generated chat names lose the 'Чат от «…»' wrapper", () => {
  assert.equal(chatTitle("Чат от «Сделай меню и контакты»"), "Сделай меню и к…");
  assert.equal(windowTitle({ kind: "idle", label: "" }, "Чат от «Дизайн сайта»"), "Дизайн сайта");
});

test("without a chat the tab falls back to the current page name", () => {
  assert.equal(windowTitle({ kind: "idle", label: "" }, "", "Проекты"), "Проекты");
  assert.equal(windowTitle({ kind: "idle", label: "" }), "");
});

test("the favicon is a coloured circle for every status", () => {
  for (const kind of ["idle", "working", "done", "error", "voice", "loading"]) {
    assert.match(FAVICON_COLORS[kind], /^#[0-9a-f]{6}$/i, kind);
  }
  assert.notEqual(new Set(Object.values(FAVICON_COLORS)).size, 1);
});