import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('./web/app.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

const chat = { active: { id: 'chat' }, messages: [], messagesOffset: 0 };

function message(index, role = index % 2 ? 'assistant' : 'user') {
  return { role, text: `Сообщение ${index}`, timestamp: index };
}

function window_(from, to) {
  return Array.from({ length: to - from }, (_, i) => message(from + i));
}

// Runs withLoadedHistory against a fresh window state, the way the SSE handler does.
function loader(state) {
  const context = { state, messagesFloor: null, messagesTotal: null };
  runInNewContext(between('function withLoadedHistory(', 'function summaryCard('), context);
  return context;
}

test('a streaming snapshot keeps older pages the user already scrolled to', () => {
  const paged = window_(220, 260);
  const visible = window_(260, 300);
  const context = loader({ ...chat, messages: paged.concat(visible), messagesOffset: 220 });
  context.messagesFloor = 220;
  context.messagesTotal = 300;

  const first = context.withLoadedHistory({ ...chat, messages: window_(261, 301), messagesOffset: 261, messagesTotal: 301 });
  assert.equal(first.messagesOffset, 220);
  assert.equal(first.messages.length, 81);
  assert.equal(first.messages[0].text, 'Сообщение 220');
  assert.equal(first.messages.at(-1).text, 'Сообщение 300');

  const second = context.withLoadedHistory({ ...chat, messages: window_(262, 302), messagesOffset: 262, messagesTotal: 302 });
  assert.equal(second.messagesOffset, 220);
  assert.equal(second.messages[0].text, 'Сообщение 220');
  assert.equal(second.messages.at(-1).text, 'Сообщение 301');
});

test('without loaded pages the newest window is used as is', () => {
  const context = loader({ ...chat, messages: window_(260, 300), messagesOffset: 260 });
  const next = context.withLoadedHistory({ ...chat, messages: window_(261, 301), messagesOffset: 261, messagesTotal: 301 });
  assert.equal(next.messagesOffset, 261);
  assert.equal(next.messages.length, 40);
  assert.equal(next.messages[0].text, 'Сообщение 261');
});

test('compaction drops stale pages instead of mixing them in', () => {
  const context = loader({ ...chat, messages: window_(220, 260).concat(window_(260, 300)), messagesOffset: 220 });
  context.messagesFloor = 220;
  context.messagesTotal = 300;

  const compacted = context.withLoadedHistory({ ...chat, messages: window_(0, 3), messagesOffset: 0, messagesTotal: 3 });
  assert.equal(compacted.messagesOffset, 0);
  assert.equal(compacted.messages.length, 3);
  assert.equal(compacted.messages[0].text, 'Сообщение 0');
  assert.equal(context.messagesFloor, null);
});

test('another chat starts from its own window', () => {
  const context = loader({ ...chat, messages: window_(220, 300), messagesOffset: 220 });
  context.messagesFloor = 220;
  context.messagesTotal = 300;

  const other = { active: { id: 'other' }, messages: window_(0, 10), messagesOffset: 0, messagesTotal: 10 };
  const next = context.withLoadedHistory(other);
  assert.equal(next.messagesOffset, 0);
  assert.equal(next.messages.length, 10);
  assert.equal(context.messagesFloor, null);
});