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

const {Editor}=await import(pathToFileURL(join(resolve(packageDir),'node_modules/@earendil-works/pi-tui/dist/index.js')));
const {editorMap,offsetAt,createSelection,moveCursor,cursorOffset}=await import('./selection.mjs');
const editor=new Editor(tui,{borderColor:s=>s,selectList:{}});editor.focused=true;
for(const draft of ['Привет мир','Одна строка\nДругая строка','emoji 👩‍💻 и 日本語','повтор\nповтор\nповтор','Очень длинный текст с переносами между словами и ещё несколькими словами']){
 editor.setText(draft);
 for(const width of [12,40]){
  const map=editorMap(editor,editor.render(width).slice(1,-1));
  for(const row of map){assert.equal(draft.slice(row.start,row.start+row.text.length),row.text);assert.equal(offsetAt(row,0,visibleWidth),row.start);}
 }
 const selection=createSelection(editor);selection.set(0,draft.length);assert.equal(selection.text(),draft);selection.remove();assert.equal(editor.getText(),'');
}
editor.setText('привет мир');moveCursor(editor,3);assert.equal(cursorOffset(editor),3);
const selection=createSelection(editor);selection.set(6,3);assert.equal(selection.text(),'вет');selection.remove();editor.insertTextAtCursor('мер');assert.equal(editor.getText(),'пример мир');
console.log('PASS: native editor selection, wrapped Russian/emoji text and replacement.');

const {createSurface,palettes}=await import('./surface.mjs');
tui.terminal.columns=120;tui.terminal.rows=36;editor.setText('Выделите этот текст');
const liveSelection=createSelection(editor);
const surface=createSurface({tui,delegate:editor,ctx:{isIdle:()=>true},state:()=>({scheme:'dark'}),actions:{selection:liveSelection,placeCursor:n=>moveCursor(editor,n)},rendering:{truncate:truncateToWidth,measure:visibleWidth,matchesKey}});
let screen=surface.render(120),plain=screen.map(clean),y=plain.findIndex(r=>r.includes('Выделите этот текст')),x=plain[y].indexOf('Выделите этот текст');
surface.onMouse(`\x1b[<0;${x+1};${y+1}M`);surface.render(120);
surface.onMouse(`\x1b[<32;${x+9};${y+1}M`);
assert.equal(liveSelection.text(),'Выделите');screen=surface.render(120);
assert.ok(screen[y].includes(`\x1b[48;2;${palettes.dark.selection}mВ`),'Selection must be visibly painted before mouse release');
assert.ok(screen.every(row=>visibleWidth(row)===120));
console.log('PASS: live drag highlight before release with native pi renderer.');
