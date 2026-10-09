import assert from "node:assert/strict";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { createMenu, clean } from "./menu.mjs";

const packageDir = process.argv[2];
if (!packageDir) throw new Error("Передайте путь к установленному @earendil-works/pi-coding-agent");
const here = dirname(fileURLToPath(import.meta.url));
const { loadExtensions } = await import(pathToFileURL(join(resolve(packageDir), "dist/core/extensions/loader.js")));
const loaded = await loadExtensions([join(here, "index.ts")], process.cwd());
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
assert.ok(loaded.extensions[0].commands.has("friendly"));
const { matchesKey, truncateToWidth, visibleWidth } = await import(pathToFileURL(join(resolve(packageDir), "node_modules/@earendil-works/pi-tui/dist/index.js")));
let result;
const theme = { fg: (_c, s) => s, bg: (_c, s) => s, bold: s => s };
const tui = { terminal: { columns: 90, rows: 24, write() {} }, requestRender() {} };
const menu = createMenu({ tui, theme, done: value => { result = value; }, title: "Просто pi", subtitle: "Проект: ~/Documents/AI DIY Projects",
  items: ["Новый разговор", "История разговоров", "Продолжить разговор"].map(label => ({ label })),
  statuses: () => ["Kimi K3", "Осталось 998 млн"], matchesKey, truncate: truncateToWidth, measure: visibleWidth });
const lines = menu.render(90);
assert.ok(lines.every(row => visibleWidth(row) <= 90));
menu.handleInput("\x1b[B"); menu.handleInput("\r");
assert.equal(result.label, "История разговоров");
await writeFile(join(here, "design/rendered.txt"), lines.map(line => clean(line).trimEnd()).join("\n").trimEnd() + "\n");
console.log("PASS: extension loaded by pi; real pi-tui keyboard/width checks passed.");
