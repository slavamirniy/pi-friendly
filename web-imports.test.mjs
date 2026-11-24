import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A stale module in the web folder once left the whole page on "Загружаем проекты…",
// because app.js imported an export the served file did not have. Check the imports here.

const webDir = join(dirname(fileURLToPath(import.meta.url)), "web");

function exportsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  if (/export\s+default/.test(source)) names.add("default");
  return names;
}

function importsOf(source) {
  const imports = [];
  for (const match of source.matchAll(/import\s+([^'"]*?)\s+from\s+["']([^"']+)["']/g)) {
    const [, clause, spec] = match;
    if (!spec.startsWith("./")) continue;
    const names = [];
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0];
        if (name) names.push(name);
      }
    } else if (!clause.trim().startsWith("*")) {
      names.push("default");
    }
    imports.push({ spec, names });
  }
  return imports;
}

const modules = readdirSync(webDir).filter((name) => name.endsWith(".js"));

test("web modules only import exports their files actually have", () => {
  const problems = [];
  for (const module of modules) {
    const source = readFileSync(join(webDir, module), "utf8");
    for (const { spec, names } of importsOf(source)) {
      const target = join(webDir, spec.replace(/^\.\//, ""));
      let targetSource;
      try {
        targetSource = readFileSync(target, "utf8");
      } catch {
        problems.push(`${module}: ${spec} не найден`);
        continue;
      }
      const available = exportsOf(targetSource);
      for (const name of names) {
        if (!available.has(name)) problems.push(`${module}: ${spec} не экспортирует ${name}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("the page and the app module are served from the same folder", () => {
  const html = readFileSync(join(webDir, "index.html"), "utf8");
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.match(html, /id="messages"/);
  assert.ok(modules.includes("app.js"));
});
