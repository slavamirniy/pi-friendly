import test from "node:test";
import assert from "node:assert/strict";
import { createMenu, mouseEvent, clean } from "./menu.mjs";
import { installFriendly } from "./friendly.mjs";

const rendering = { truncate: (s, w) => [...s].slice(0, w).join(""), measure: s => [...s].length, matchesKey: (s, k) => s === k };
const theme = { fg: (_c, s) => s, bg: (_c, s) => s, bold: s => s };
function panel(options = {}) {
  const writes = [], results = [];
  const tui = { terminal: { columns: 90, rows: 24, write: s => writes.push(s) }, requestRender() {} };
  const menu = createMenu({ ...rendering, tui, theme, title: "Просто pi", items: Array.from({ length: 60 }, (_, i) => ({ label: `Модель ${i}` })), done: v => results.push(v), ...options });
  return { menu, tui, writes, results };
}
test("mouse targets match rendered rows; release, drag, right click and blank space do not activate", () => {
  const h = panel(); h.menu.render(90);
  for (const data of ["\x1b[<0;5;5m", "\x1b[<32;5;5M", "\x1b[<2;5;5M", "\x1b[<0;85;5M"]) h.menu.handleInput(data);
  assert.equal(h.results.length, 0);
  h.menu.handleInput("\x1b[<0;30;5M");
  assert.equal(h.results[0].label, "Модель 0");
  const count = h.writes.length; h.menu.dispose(); assert.equal(h.writes.length, count);
  assert.match(h.writes.at(-1), /1000l/);
});
test("search, keyboard paging and wheel reach models beyond first page", () => {
  const h = panel({ searchable: true }); h.menu.render(90);
  h.menu.handleInput("Модель 59"); h.menu.render(90); h.menu.handleInput("enter");
  assert.equal(h.results[0].label, "Модель 59");
  const p = panel();
  for (let i = 0; i < 45; i++) { p.menu.render(90); p.menu.handleInput("\x1b[<65;5;5M"); }
  assert.ok(p.menu.render(90).some(row => row.includes("Модель 45")));
  p.menu.handleInput("enter"); assert.equal(p.results[0].label, "Модель 45");
});
test("resize invalidates mouse targets and every row fits small windows", () => {
  const h = panel(); h.menu.render(90); h.tui.terminal.rows = 12;
  h.menu.handleInput("\x1b[<0;5;5M"); assert.equal(h.results.length, 0);
  for (const width of [12, 24, 40, 80]) for (const height of [5, 9, 12, 24]) {
    h.tui.terminal.columns = width; h.tui.terminal.rows = height;
    const rows = h.menu.render(width);
    assert.ok(rows.length <= height); assert.ok(rows.every(row => [...row].length <= width));
    if (width >= 24 && height >= 9) assert.equal(rows.length, height);
  }
  h.menu.handleInput("escape"); assert.deepEqual(h.results, [undefined]);
});
test("terminal controls in external labels are removed", () => {
  assert.equal(clean("A\x1b[2JB\nC\x1b]52;c;secret\x07"), "AB C");
  assert.equal(mouseEvent("not mouse"), undefined);
});

function harness({ mode = "tui", flags = {}, sessions = [] } = {}) {
  const events = new Map(), commands = new Map(), shortcuts = new Map(), statuses = new Map(), widgets = new Map();
  const choices = [], notifications = [], models = [], calls = [];
  let draft = "", footer, header, idle = true, expanded = true;
  const pi = {
    on: (name, fn) => events.set(name, [...(events.get(name) ?? []), fn]),
    registerCommand: (name, value) => commands.set(name, value),
    registerShortcut: (name, value) => shortcuts.set(name, value),
    registerFlag() {}, getFlag: name => name === "friendly-no-welcome" || flags[name],
    getCommands: () => [{ name: "new-plugin", description: "A plugin added later", source: "extension" }],
    setModel: async model => { models.push(model); return true; },
  };
  const ctx = { mode, hasUI: mode === "tui", cwd: "/project", model: { name: "Test model" },
    isIdle: () => idle, abort: () => calls.push("abort"), switchSession: async path => calls.push(path),
    modelRegistry: { getAvailable: () => [{ name: "Другой", id: "other", provider: "test" }] },
    ui: {
      setToolsExpanded: value => { expanded = value; },
      setHeader: factory => { header = factory(null, theme); },
      setFooter: factory => { footer = factory(null, theme, { getExtensionStatuses: () => statuses }); },
      setStatus: (key, value) => { if (value === undefined) statuses.delete(key); else statuses.set(key, value); },
      setWidget: (key, value) => widgets.set(key, value), setWorkingVisible() {},
      getEditorText: () => draft, setEditorText: text => { draft = text; },
      notify: text => notifications.push(text), confirm: async () => true,
      custom: async (factory, options) => {
        assert.equal(options.overlayOptions.row, 0);
        let result;
        const component = factory({ terminal: { rows: 30, columns: 100, write() {} }, requestRender() {} }, theme, {}, value => { result = value; });
        const rows = component.render(100);
        const choice = choices.shift();
        if (choice === undefined) component.handleInput("escape");
        else {
          const y = rows.findIndex(row => row.includes(choice));
          assert.ok(y >= 0, `Missing button ${choice} in ${rows.join("\n")}`);
          component.handleInput(`\x1b[<0;35;${y + 1}M`);
        }
        component.dispose(); return result;
      },
    },
  };
  installFriendly(pi, { ...rendering, listSessions: async () => sessions });
  const emit = async (name, event = {}) => { for (const fn of events.get(name) ?? []) await fn(event, ctx); };
  return { pi, ctx, emit, choices, notifications, calls, models, statuses, widgets,
    open: (args = "") => commands.get("friendly").handler(args, ctx),
    footer: () => footer, header: () => header, expanded: () => expanded,
    setIdle: value => { idle = value; },
  };
}
test("router status and other plugin statuses survive; widgets are not replaced", async () => {
  const h = harness();
  await h.emit("session_start");
  h.ctx.ui.setStatus("router", "Осталось 998 млн"); h.ctx.ui.setStatus("other", "Other plugin OK");
  h.ctx.ui.setWidget("router", ["Создаю файлы"]);
  const rows = h.footer().render(100);
  assert.ok(rows.includes("Осталось 998 млн")); assert.ok(rows.includes("Other plugin OK"));
  assert.deepEqual(h.widgets.get("router"), ["Создаю файлы"]);
  assert.equal(h.expanded(), false);
  await h.emit("session_shutdown");
});
test("menu routes new conversation through native command", async () => {
  const h = harness(); await h.emit("session_start");
  h.choices.push("Новый разговор"); await h.open();
  assert.equal(h.ctx.ui.getEditorText(), "/new");
});
test("history groups projects and switches selected session through host API", async () => {
  const h = harness({ sessions: [
    { cwd: "/projects/Bakery", name: "Сайт пекарни", path: "/sessions/bakery.jsonl", modified: new Date(), messageCount: 4 },
    { cwd: "/projects/Shop", name: "Магазин", path: "/sessions/shop.jsonl", modified: new Date(), messageCount: 2 },
  ] }); await h.emit("session_start");
  h.choices.push("Bakery", "Сайт пекарни"); await h.open("history");
  assert.deepEqual(h.calls, ["/sessions/bakery.jsonl"]);
});
test("RPC/print modes stay untouched and competing footer can be retained", async () => {
  for (const mode of ["rpc", "print", "json"]) {
    const h = harness({ mode }); await h.emit("session_start"); await h.open();
    assert.equal(h.footer(), undefined); assert.equal(h.header(), undefined); assert.equal(h.expanded(), true);
  }
  const h = harness({ flags: { "friendly-keep-footer": true } }); await h.emit("session_start"); assert.equal(h.footer(), undefined);
});
test("busy commands and declined draft replacement leave editor untouched", async () => {
  const h = harness(); await h.emit("session_start");
  h.ctx.ui.setEditorText("Важный текст"); h.setIdle(false);
  h.choices.push("Новый разговор"); await h.open();
  assert.equal(h.ctx.ui.getEditorText(), "Важный текст");
  h.setIdle(true); h.ctx.ui.confirm = async () => false;
  h.choices.push("История разговоров"); await h.open();
  assert.equal(h.ctx.ui.getEditorText(), "Важный текст");
});

test("popular commands and other commands are separate, dynamic plugin commands remain available", async () => {
 const h=harness();await h.emit("session_start");
 h.choices.push("Скопировать ответ");await h.open("commands");assert.equal(h.ctx.ui.getEditorText(),"/copy");
 h.ctx.ui.setEditorText("");h.choices.push("Другие команды","/new-plugin");await h.open("commands");assert.equal(h.ctx.ui.getEditorText(),"/new-plugin");
 await h.emit("session_shutdown");
});

 test('right pane close button and choices use rendered coordinates', async()=>{
  const {palettes}=await import('./surface.mjs');
  const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
  const h=panel({panel:true,palette:palettes.light,searchable:true,measure:s=>strip(s).length,truncate:(s,w)=>strip(s).slice(0,w)});
  const rows=h.menu.render(62).map(strip);
  const x=rows[1].indexOf('×');assert.ok(x>0);
  h.menu.handleInput(`\x1b[<0;${x+1};2M`);assert.deepEqual(h.results,[undefined]);
  const k=panel({panel:true,palette:palettes.light,searchable:true,measure:s=>strip(s).length,truncate:(s,w)=>strip(s).slice(0,w)});
  const items=k.menu.render(62).map(strip);const y=items.findIndex(r=>r.includes('Модель 0'));const ix=items[y].indexOf('Модель 0');
  k.menu.handleInput(`\x1b[<0;${ix+1};${y+1}M`);assert.equal(k.results[0].label,'Модель 0');
 });
