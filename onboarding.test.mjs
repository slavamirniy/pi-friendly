import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { startWebServer } from './web-server.mjs';
import { createOnboarding, voiceIsAvailable } from './web/onboarding.js';

function fixture() {
  let now = 0, sequence = 0;
  const timers = new Map(), frames = [];
  class Node {
    constructor(tag = 'div') {
      this.tag = tag; this.children = []; this.value = ''; this.isConnected = true;
      this.offsetWidth = 224; this.offsetHeight = 50; this.disabled = false;
      this.classes = new Set(); this.attributes = {}; this.events = {}; this.dataset = {};
      this.style = { setProperty() {} };
      this.classList = { add: (...values) => values.forEach(v => this.classes.add(v)), remove: (...values) => values.forEach(v => this.classes.delete(v)), contains: v => this.classes.has(v), toggle: (v, on) => on ? this.classes.add(v) : this.classes.delete(v) };
    }
    set className(v) { this.classes = new Set(v.split(' ')); }
    get textContent() { return this.text || this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this.text = v; }
    get firstChild() { return this.children[0]; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; this.text = ''; }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, fn) { this.events[k] = fn; }
    getBoundingClientRect() { return { left: 100, right: 500, top: 400, bottom: 440, width: 400, height: 40 }; }
    closest() { return wrap; }
  }
  const wrap = new Node(), body = new Node();
  const ids = Object.fromEntries(['draft', 'composer', 'send', 'mic'].map(id => [id, new Node()]));
  const document = { body, createElement: tag => new Node(tag), createElementNS: (_, tag) => new Node(tag), createTextNode: text => { const n = new Node(); n.textContent = text; return n; }, getElementById: id => ids[id], addEventListener() {} };
  const window = { innerWidth: 1400, innerHeight: 900, addEventListener() {}, requestAnimationFrame(fn) { frames.push(fn); return frames.length; } };
  const schedule = (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; };
  const cancel = id => timers.delete(id);
  const coach = createOnboarding({ document, window, icon: () => new Node('svg'), setTimer: schedule, clearTimer: cancel });
  const advance = ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } };
  const visible = text => body.children.some(n => n.classList.contains('is-visible') && n.textContent.includes(text));
  const update = changes => { state = { ...state, ...changes }; coach.update(state); };
  let state = { page: 'chat', chatId: 'chat-1', connected: true, voicePhase: 'ready', voiceTarget: 'chat', wizard: true };
  update({});
  return { coach, update, ids, visible, advance, Node, body, frames, wrap, schedule, cancel };
}

test('project hint changes two seconds after the first character, then tracks the real request', () => {
  const f = fixture(); f.update({ page: 'create' });
  const input = new f.Node('input'), submit = new f.Node('button');
  f.coach.bindProject(input, submit);
  assert(f.visible('Введи название'));
  input.value = 'С'; input.events.input(); f.advance(1500);
  input.value = 'Сайт'; input.events.input(); assert(!f.visible('Создайте проект'));
  f.advance(500); assert(f.visible('Создайте проект'));
  f.coach.projectLoading(true); assert(f.visible('Подождите, пока проект создаётся'));
  f.coach.projectLoading(false); assert(f.visible('Создайте проект'));
  input.value = ''; input.events.input(); assert(f.visible('Введи название'));
  f.update({ page: 'projects' }); f.advance(3000); assert(!f.visible('Создайте проект'));
});

test('manual send hint waits five seconds from first input, not the last keystroke', () => {
  const f = fixture(); assert(f.visible('Здесь опиши задачу'));
  f.ids.draft.value = 'С'; f.coach.typed(); f.advance(4500);
  f.ids.draft.value = 'Сделай сайт'; f.coach.typed(); assert(!f.visible('Отправить'));
  f.advance(500); assert(f.visible('Нажми «Отправить»'));
  assert.equal(f.wrap.classList.contains('has-send-coachmark'), false);
  f.ids.draft.value = ''; f.coach.typed(); assert(!f.visible('Отправить')); assert(f.visible('Здесь опиши задачу'));
});

test('voice instructions stay hidden until model ready and change to a square while recording', () => {
  const f = fixture();
  for (const voicePhase of [undefined, 'installing', 'downloading', 'loading', 'error']) {
    f.update({ voicePhase }); assert(!f.visible('микрофон')); assert.equal(voiceIsAvailable(voicePhase), false);
  }
  f.update({ voicePhase: 'ready' }); assert(f.visible('Нажми микрофон'));
  f.update({ voicePhase: 'recording' }); assert(f.visible('закончить говорить')); assert(!f.visible('Здесь опиши задачу'));
  f.update({ voicePhase: 'transcribing' }); assert(!f.visible('закончить говорить'));
  f.ids.draft.value = 'Создай магазин'; f.coach.dictated(); assert(!f.visible('Отправить'));
  f.update({ voicePhase: 'ready' }); assert(f.visible('Нажми «Отправить»'), 'No typing delay after transcription');
});

test('navigation, existing messages and send errors do not leave stale instructions', () => {
  const f = fixture();
  f.ids.draft.value = 'Задача'; f.coach.typed(); f.advance(5000);
  f.update({ chatId: 'chat-2' }); assert(!f.visible('Отправить'));
  f.update({ chatId: 'chat-1' }); assert(f.visible('Отправить'));
  f.coach.submitted(); assert(!f.visible('Отправить'));
  f.coach.submitted(false); assert(f.visible('Отправить'));
  f.update({ imageOpen: true }); assert(!f.visible('Отправить'));
  f.update({ imageOpen: false, hasMessages: true }); assert(!f.visible('микрофон'));
  f.update({ page: 'projects' }); assert(!f.visible('Здесь опиши задачу'));
});

test('hints can be positioned without moving transitions; integration hides both microphone controls', async () => {
  const f = fixture(); while (f.frames.length) f.frames.shift()();
  assert(f.body.children.some(n => n.style.left));
  const root = new URL('./', import.meta.url);
  const html = await readFile(new URL('web/index.html', root), 'utf8');
  for (const id of ['mic', 'panel-mic']) assert.match(html, new RegExp(`<button[^>]*id="${id}"[^>]* hidden`));
  const server = await readFile(new URL('web-server.mjs', root), 'utf8');
  assert(server.includes("'/onboarding.js':['web/onboarding.js','text/javascript']"));
});

test('project submission starts immediately, holds loader for five seconds and then opens the real chat', async () => {
  const f = fixture(), root = new f.Node();
  root.prepend = () => {};
  f.Node.prototype.focus = () => {};
  f.Node.prototype.removeAttribute = function(k) { delete this.attributes[k]; };
  let finishRequest, task, appliedSnapshot, applied = 0, requestCount = 0;
  const context = {
    el: tag => new f.Node(tag), icon: () => new f.Node('svg'), pageShell: () => root,
    navigate() {}, updateOnboarding() {}, onboarding: { bindProject() {}, projectLoading() {} },
    page: 'create', projectId: null, projectCreationInFlight: false, state: {},
    setTimeout: f.schedule, clearTimeout: f.cancel,
    api() { requestCount++; return new Promise(resolve => { finishRequest = resolve; }); },
    run(_, fn) { task = fn(); return task; }, applyState(next) { applied++; appliedSnapshot = next; },
    loadCatalog: async () => {}, renderRoute() {},
  };
  const source = await readFile(new URL('./web/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function renderCreatePage()');
  const end = source.indexOf('/* ============================== chat rendering', start);
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  context.renderCreatePage();
  const form = root.children[0], input = form.children[1], submit = form.children[3].children.find(n => n.id === 'create-project-submit');
  input.value = 'Новый сайт'; form.onsubmit({ preventDefault() {} });
  assert.equal(requestCount, 1); assert.equal(submit.disabled, true); assert.equal(submit.attributes['aria-busy'], 'true');
  finishRequest({ active: { id: 'real-chat', projectId: 'real-project' }, ready: false }); await Promise.resolve();
  context.state = { active: { id: 'real-chat', projectId: 'real-project' }, ready: true };
  f.advance(4999); await Promise.resolve(); assert.equal(applied, 0);
  f.advance(1); await task; await Promise.resolve();
  assert.equal(applied, 1); assert.equal(context.page, 'chat'); assert.equal(context.projectId, 'real-project');
  assert.equal(context.projectCreationInFlight, false); assert.equal(submit.disabled, false);
  assert.equal(appliedSnapshot.ready, true, 'Preserve ready state received during the animation');
});

test('running application serves the new instruction module', async t => {
  const web = await startWebServer({ projects: { list: () => [] }, listSessions: async () => [], readSession: () => [] });
  t.after(() => web.close());
  let response;
  try { response = await fetch(web.origin + '/onboarding.js'); }
  catch (error) {
    if (['EACCES', 'EPERM'].includes(error.cause?.code)) {
      t.skip('Environment blocks HTTP connections to the local test server');
      return;
    }
    throw error;
  }
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(await response.text(), /export function createOnboarding/);
});
