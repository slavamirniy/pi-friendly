import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  createSubagentService,
  describeTool,
  discoverAgents,
  parseAgentMarkdown,
} from './subagents.mjs';

const AGENT = `---
name: scout
description: Разведка
tools: read, grep, bash
---
Ты разведчик.`;

const WRITE = `---
name: scout
description: Пользовательская разведка
tools: [read]
model: test-model
---
Свой промпт.`;

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'pi-subagents-test-'));
  const builtin = join(root, 'builtin');
  const user = join(root, 'user');
  await mkdir(builtin, {recursive: true});
  await mkdir(user, {recursive: true});
  await writeFile(join(builtin, 'scout.md'), AGENT);
  t.after(() => rm(root, {recursive: true, force: true}));
  return {root, builtin, user};
}

function fakeChild({lines = [], code = 0, delay = 5} = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.emit('close', 143);
  };
  setImmediate(() => {
    for (const line of lines) child.stdout.write(`${JSON.stringify(line)}\n`);
    child.stdout.end();
    setImmediate(() => {
      if (!child.killed) child.emit('close', code);
    });
  });
  return child;
}

function assistant(text, usage = {}) {
  return {
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{type: 'text', text}],
      usage: {input: 10, output: 20, cost: {total: 0.01}, totalTokens: 30},
      stopReason: 'stop',
      model: 'test-model',
      ...usage,
    },
  };
}

test('agent markdown frontmatter accepts lists and keeps the prompt body', () => {
  const parsed = parseAgentMarkdown(WRITE);
  assert.equal(parsed.frontmatter.name, 'scout');
  assert.deepEqual(parsed.frontmatter.tools, ['read']);
  assert.equal(parsed.body, 'Свой промпт.');
  assert.equal(parseAgentMarkdown('Без шапки').body, 'Без шапки');
});

test('built-in agents are loaded and user agents override them', async (t) => {
  const {builtin, user} = await workspace(t);
  let discovery = discoverAgents({cwd: builtin, builtinDir: builtin, userDir: user});
  assert.equal(discovery.agents.length, 1);
  assert.equal(discovery.agents[0].source, 'builtin');
  assert.deepEqual(discovery.agents[0].tools, ['read', 'grep', 'bash']);

  await writeFile(join(user, 'scout.md'), WRITE);
  discovery = discoverAgents({cwd: builtin, builtinDir: builtin, userDir: user});
  assert.equal(discovery.agents.length, 1);
  assert.equal(discovery.agents[0].source, 'user');
  assert.equal(discovery.agents[0].model, 'test-model');
});

test('project agents appear only when requested', async (t) => {
  const {root, builtin, user} = await workspace(t);
  const project = join(root, 'project');
  await mkdir(join(project, '.pi', 'agents'), {recursive: true});
  await writeFile(join(project, '.pi', 'agents', 'planner.md'), '---\nname: planner\ndescription: План\n---\nПланируй.');
  assert.equal(discoverAgents({cwd: project, builtinDir: builtin, userDir: user}).agents.length, 1);
  const both = discoverAgents({cwd: project, builtinDir: builtin, userDir: user, scope: 'both'});
  assert.deepEqual(both.agents.map((agent) => agent.name).sort(), ['planner', 'scout']);
  assert.ok(both.projectAgentsDir.endsWith(join('.pi', 'agents')));
});

test('tool labels stay short and human readable', () => {
  assert.match(describeTool('read', {path: '/tmp/index.html'}), /Читает файл/);
  assert.match(describeTool('bash', {command: 'npm test'}), /npm test/);
  assert.match(describeTool('grep', {pattern: 'subagent'}), /subagent/);
});

test('single subagent streams progress, result and usage', async (t) => {
  const {builtin, user} = await workspace(t);
  const snapshots = [];
  const invocations = [];
  const service = createSubagentService({
    cli: '/pi/cli.js',
    emit: (list) => snapshots.push(list),
    spawnProcess: (command, args, options) => {
      invocations.push({command, args, options});
      return fakeChild({
        lines: [
          {type: 'message_start', message: {role: 'assistant', content: []}},
          {type: 'message_update', assistantMessageEvent: {type: 'text_delta', delta: 'Смотрю файлы'}},
          {type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', args: {path: '/tmp/a.js'}},
          {type: 'tool_execution_end', toolCallId: 't1', toolName: 'read', isError: false},
          assistant('Нашёл ответ.'),
        ],
      });
    },
  });
  t.after(() => service.dispose());

  const result = await service.run(
    {agent: 'scout', task: 'Найди точку входа'},
    {cwd: builtin, userDir: user, builtinDir: builtin, model: {id: 'parent-model', provider: 'router'}, thinkingLevel: 'medium'},
  );

  assert.equal(result.content[0].text, 'Нашёл ответ.');
  assert.equal(result.details.subagents[0].status, 'done');
  assert.equal(result.details.subagents[0].agent, 'scout');
  assert.equal(result.details.subagents[0].usage.input, 10);
  assert.equal(result.details.subagents[0].usage.output, 20);
  assert.ok(result.details.subagents[0].items.some((item) => item.type === 'tool' && item.status === 'done'));
  assert.ok(snapshots.some((list) => list.some((entry) => entry.status === 'running')));
  assert.ok(snapshots.some((list) => list.some((entry) => entry.status === 'done' && entry.output === 'Нашёл ответ.')));

  const invocation = invocations[0];
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], '/pi/cli.js');
  assert.ok(invocation.args.includes('--mode') && invocation.args.includes('json'));
  assert.ok(invocation.args.includes('--no-session'));
  assert.ok(invocation.args.includes('--exclude-tools') && invocation.args.includes('subagent'));
  assert.ok(invocation.args.includes('--model') && invocation.args.includes('parent-model'));
  assert.ok(invocation.args.includes('--provider') && invocation.args.includes('router'));
  assert.ok(invocation.args.includes('--thinking') && invocation.args.includes('medium'));
  assert.ok(invocation.args.includes('--tools') && invocation.args.includes('read,grep,bash'));
  assert.ok(invocation.args.some((value) => String(value).startsWith('Task: Найди точку входа')));
  assert.equal(invocation.options.env.PI_FRIENDLY_SUBAGENT_DEPTH, '1');
  assert.equal(invocation.options.env.PI_FRIENDLY_WEB_CHILD, undefined);
});
test('subagent system prompt keeps internal tool notes out of the final answer', async (t) => {
  const {builtin, user} = await workspace(t);
  let prompt;
  const service = createSubagentService({
    cli: '/pi/cli.js',
    emit: () => {},
    spawnProcess: (_command, args) => {
      const promptPath = args[args.indexOf('--append-system-prompt') + 1];
      prompt = readFileSync(promptPath, 'utf8');
      return fakeChild({lines: [assistant('Готово.')]});
    },
  });
  t.after(() => service.dispose());
  const result = await service.run({agent: 'scout', task: 'Проверь задачу'}, {cwd: builtin, userDir: user, builtinDir: builtin});
  assert.equal(result.content[0].text, 'Готово.');
  assert.match(prompt, /Не показывай внутренние рассуждения/);
});

test('chain passes previous output through the {previous} placeholder', async (t) => {
  const {builtin, user} = await workspace(t);
  const tasks = [];
  const service = createSubagentService({
    cli: '/pi/cli.js',
    emit: () => {},
    spawnProcess: (_command, args) => {
      tasks.push(args.at(-1));
      return fakeChild({lines: [assistant(tasks.length === 1 ? 'Контекст найден' : 'План готов')]});
    },
  });
  t.after(() => service.dispose());
  const result = await service.run(
    {chain: [{agent: 'scout', task: 'Разведай'}, {agent: 'scout', task: 'Составь план по: {previous}'}]},
    {cwd: builtin, userDir: user, builtinDir: builtin},
  );
  assert.equal(tasks[0], 'Task: Разведай');
  assert.equal(tasks[1], 'Task: Составь план по: Контекст найден');
  assert.equal(result.content[0].text, 'План готов');
  assert.equal(result.details.subagents.length, 2);
  assert.deepEqual(result.details.subagents.map((entry) => entry.status), ['done', 'done']);
});

test('parallel mode runs independent tasks and reports failures', async (t) => {
  const {builtin, user} = await workspace(t);
  let index = 0;
  const service = createSubagentService({
    cli: '/pi/cli.js',
    emit: () => {},
    spawnProcess: () => {
      const current = index++;
      return fakeChild(
        current === 0
          ? {lines: [assistant('Первый готов')]}
          : {lines: [{type: 'message_end', message: {role: 'assistant', content: [], stopReason: 'error', errorMessage: 'Нет связи'}}], code: 1},
      );
    },
  });
  t.after(() => service.dispose());
  const result = await service.run(
    {tasks: [{agent: 'scout', task: 'Раз'}, {agent: 'scout', task: 'Два'}]},
    {cwd: builtin, userDir: user, builtinDir: builtin},
  );
  const statuses = result.details.subagents.map((entry) => entry.status).sort();
  assert.deepEqual(statuses, ['done', 'error']);
  assert.match(result.content[0].text, /Параллельно: 1\/2/);
});

test('unknown agent and invalid mode are reported without spawning', async (t) => {
  const {builtin, user} = await workspace(t);
  let spawned = false;
  const service = createSubagentService({
    cli: '/pi/cli.js',
    emit: () => {},
    spawnProcess: () => {
      spawned = true;
      return fakeChild();
    },
  });
  t.after(() => service.dispose());
  const unknown = await service.run({agent: 'nobody', task: 'x'}, {cwd: builtin, userDir: user, builtinDir: builtin});
  assert.match(unknown.content[0].text, /Неизвестный агент/);
  const invalid = await service.run({}, {cwd: builtin, userDir: user, builtinDir: builtin});
  assert.match(invalid.content[0].text, /Укажите ровно один режим/);
  assert.equal(spawned, false);
});

test('abort stops the child and marks the subagent as stopped', async (t) => {
  const {builtin, user} = await workspace(t);
  const controller = new AbortController();
  let child;
  const service = createSubagentService({
    cli: '/pi/cli.js',
    emit: () => {},
    spawnProcess: () => {
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => child.emit('close', 143);
      return child;
    },
  });
  t.after(() => service.dispose());
  const running = service.run(
    {agent: 'scout', task: 'Долгая задача'},
    {cwd: builtin, userDir: user, builtinDir: builtin, signal: controller.signal},
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(service.snapshot()[0]?.status, 'running');
  controller.abort();
  const result = await running;
  assert.equal(result.details.subagents[0].status, 'stopped');
  assert.equal(service.snapshot()[0]?.status, 'stopped');
});
test('an already aborted signal resolves without hanging', async (t) => {
  const {builtin, user} = await workspace(t);
  const controller = new AbortController();
  controller.abort();
  const service = createSubagentService({
    cli: '/pi/cli.js',
    emit: () => {},
    spawnProcess: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => child.emit('close', 143);
      return child;
    },
  });
  t.after(() => service.dispose());
  const result = await service.run(
    {agent: 'scout', task: 'Отменённая задача'},
    {cwd: builtin, userDir: user, builtinDir: builtin, signal: controller.signal},
  );
  assert.equal(result.details.subagents[0].status, 'stopped');
});
