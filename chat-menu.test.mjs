import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./web/app.js", import.meta.url), "utf8");
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

function menuFixture({ active = { id: "chat" }, busy = false, compacting = null, messages = [{ role: "user" }], opened = [] } = {}) {
  const nodes = [];
  const context = {
    state: { active, busy, compacting, messages },
    chatMenu: {
      replaceChildren: (...items) => nodes.splice(0, nodes.length, ...items),
      hidePopover: () => opened.push("closed"),
    },
    el: (tag, text, cls) => ({ tag, text, cls, children: [], append(...items) { this.children.push(...items); } }),
    icon: (name) => ({ name }),
    openImagePanel: () => opened.push("images"),
    compactConversation: () => opened.push("compact"),
  };
  runInNewContext(between("function chatMenuItem(", "function positionChatMenu("), context);
  context.renderChatMenu();
  return { items: nodes, opened, context };
}

test("the chat menu offers the image generator and chat optimisation with labels", () => {
  const { items, opened } = menuFixture();
  assert.equal(items.length, 2);
  const labels = items.map((item) => item.children[1].children[0].text);
  assert.deepEqual(labels, ["Генератор картинок", "Оптимизировать чат"]);
  const hints = items.map((item) => item.children[1].children[1].text);
  assert.match(hints[0], /изображение/i);
  assert.match(hints[1], /контекст/i);
  items[0].onclick();
  items[1].onclick();
  assert.deepEqual(opened, ["closed", "images", "closed", "compact"]);
});

test("actions are disabled without a chat, during an answer and without history", () => {
  assert.equal(menuFixture({ active: null }).items[0].disabled, true);
  assert.equal(menuFixture({ active: { id: "chat", readOnly: true } }).items[0].disabled, true);
  assert.equal(menuFixture({ busy: true }).items[1].disabled, true);
  assert.equal(menuFixture({ messages: [] }).items[1].disabled, true);
  const compacting = menuFixture({ compacting: { reason: "manual" } });
  assert.equal(compacting.items[1].disabled, true);
  assert.equal(compacting.items[1].children[1].children[0].text, "Оптимизирую чат…");
});

test("the menu closes itself before running an action", () => {
  const fixture = menuFixture();
  fixture.items[1].onclick();
  assert.deepEqual(fixture.opened, ["closed", "compact"]);
});

test("the sidebar no longer shows the context usage label", () => {
  assert.ok(!source.includes("context-usage"));
  assert.ok(!source.includes("renderContextUsage"));
  assert.ok(!source.includes("Контекст "));
  const html = readFileSync(new URL("./web/index.html", import.meta.url), "utf8");
  assert.ok(!html.includes("context-usage"));
  assert.ok(html.includes('id="chat-menu-open"'));
});