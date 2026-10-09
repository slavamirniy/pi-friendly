import { createMenu, clean } from "./menu.mjs";
import { createWorkspace } from "./workspace.mjs";

export function groupProjects(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const cwd = session.cwd || "Проект не указан";
    if (!groups.has(cwd)) groups.set(cwd, []);
    groups.get(cwd).push(session);
  }
  return [...groups].map(([cwd, items]) => ({ cwd, items: items.sort((a, b) => +new Date(b.modified) - +new Date(a.modified)) }));
}

export function installFriendly(pi, rendering) {
  let opened = false, footerData, activeMenu, startupTimer, stopped = false, workspace, footerRows = 1;
  pi.registerFlag("friendly-no-welcome", { description: "Не открывать стартовое меню Просто pi", type: "boolean", default: false });
  pi.registerFlag("friendly-keep-footer", { description: "Сохранить footer другого расширения (без кликабельных slash-подсказок)", type: "boolean", default: false });
  const statuses = () => [...(footerData?.getExtensionStatuses().values() ?? [])].filter(Boolean);
  const modelLabel = ctx => clean(ctx.model?.name || ctx.model?.id || "Модель не выбрана");
  const notifyError = (ctx, error) => { if (!stopped) ctx.ui.notify(`Не удалось выполнить действие: ${clean(error?.message ?? error)}`, "error"); };
  const safe = (ctx, fn) => async () => { try { await fn(); } catch (error) { notifyError(ctx, error); } };

  async function choose(ctx, title, items, searchable = false, subtitle = ctx.cwd) {
    return ctx.ui.custom((tui, theme, _keys, done) => {
      activeMenu = createMenu({ ...rendering, tui, theme, done, title, subtitle, items, searchable, statuses: () => [modelLabel(ctx), ...statuses()] });
      return activeMenu;
    }, { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", row: 0, col: 0, margin: 0 } });
  }
  async function dialog(ctx, fn) {
    if (ctx.mode !== "tui" || opened || stopped) return;
    opened = true;
    try { return await fn(); }
    finally { activeMenu?.dispose(); activeMenu = undefined; opened = false; }
  }
  async function command(ctx, text) {
    if (!ctx.isIdle()) { ctx.ui.notify("Сначала дождитесь ответа или нажмите «Остановить».", "info"); return; }
    const draft = ctx.ui.getEditorText();
    if (draft.trim() && !await ctx.ui.confirm("Открыть действие?", "Текст в поле ввода будет заменён. Отмените, чтобы сначала отправить или сохранить его.")) return;
    ctx.ui.setEditorText(text);
    if (workspace) workspace.submit();
    else ctx.ui.notify("Нажмите Enter, чтобы выполнить команду.", "info");
  }
  async function selectModel(ctx) {
    if (!ctx.isIdle()) { ctx.ui.notify("Модель можно сменить после завершения ответа.", "info"); return; }
    const models = ctx.modelRegistry.getAvailable();
    if (!models.length) { ctx.ui.notify("Нет доступных моделей. Добавьте подключение через /login.", "warning"); return; }
    const selected = await dialog(ctx, () => choose(ctx, "Выберите модель", models.map(model => ({ model, label: model.name || model.id, description: `${model.provider} / ${model.id}` })), true));
    if (selected && !await pi.setModel(selected.model)) ctx.ui.notify("Модель недоступна: проверьте подключение.", "warning");
  }
  async function history(ctx) {
    if (!ctx.isIdle()) { ctx.ui.notify("Сначала остановите текущий ответ.", "info"); return; }
    const selected = await dialog(ctx, async () => {
      const sessions = await rendering.listSessions();
      if (!sessions.length) { ctx.ui.notify("История пока пуста. Начните новый разговор.", "info"); return; }
      const projects = groupProjects(sessions);
      let project;
      while (!stopped) {
        if (!project) {
          project = await choose(ctx, "История · выберите проект", projects.map(group => ({ ...group, label: group.cwd.split(/[\\/]/).filter(Boolean).at(-1) || group.cwd, description: `${group.items.length} разговоров · ${group.cwd}` })), true, "Ваши разговоры сгруппированы по папкам проектов");
          if (!project) return;
        }
        const session = await choose(ctx, "История разговоров", project.items.map(item => ({ session: item,
          label: item.name || clean(item.firstMessage).slice(0, 80) || "Без названия",
          description: `${new Date(item.modified).toLocaleDateString("ru-RU")} · ${item.messageCount} сообщений`,
        })), true, project.cwd);
        if (session) return session.session;
        project = undefined;
      }
    });
    if (selected) {
      if (ctx.ui.getEditorText().trim() && !await ctx.ui.confirm("Открыть другой разговор?", "Неотправленный текст в поле ввода будет потерян.")) return;
      await ctx.switchSession(selected.path);
    }
  }
  async function menu(ctx) {
    const active = Boolean(ctx.ui.getEditorText().trim() || ctx.sessionManager?.getEntries().some(entry => entry.type === "message"));
    const action = await dialog(ctx, () => choose(ctx, "Просто pi", [
      { id: "new", label: "Новый разговор", description: "Начать с чистого листа" },
      { id: "history", label: "История разговоров", description: "Выбрать проект и разговор" },
      ...(active ? [{ id: "chat", label: "Продолжить разговор", description: "Вернуться к текущей задаче" }] : []),
    ], false, "С чего начнём?"));
    if (action?.id === "new") await command(ctx, "/new");
    if (action?.id === "history") await command(ctx, "/friendly history");
  }
  pi.registerCommand("friendly", { description: "Новый разговор и история по проектам", handler: async (args, ctx) => safe(ctx, () => args.trim() === "history" ? history(ctx) : menu(ctx))() });
  pi.registerShortcut("f2", { description: "Открыть меню Просто pi", handler: ctx => safe(ctx, () => menu(ctx))() });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    stopped = false;
    ctx.ui.setToolsExpanded(false);
    ctx.ui.setHeader(() => ({ render: () => ["", ""], invalidate() {} }));
    if (!pi.getFlag("friendly-keep-footer")) ctx.ui.setFooter((_tui, theme, data) => {
      footerData = data;
      return { render(width) {
        const rows = [theme.fg("muted", modelLabel(ctx)), ...statuses()].map(row => rendering.truncate(row, width, ""));
        footerRows = rows.length; return rows;
      }, invalidate() {} };
    });
    if (rendering.makeEditor && ctx.ui.setEditorComponent) {
      const previousFactory = ctx.ui.getEditorComponent();
      ctx.ui.setEditorComponent((tui, editorTheme, keys) => {
        workspace?.dispose();
        const delegate = previousFactory ? previousFactory(tui, editorTheme, keys) : rendering.makeEditor(tui, editorTheme, keys);
        workspace = createWorkspace({ delegate, tui, theme: ctx.ui.theme, rendering, ctx,
          footerHeight: () => footerRows, slashEnabled: !pi.getFlag("friendly-keep-footer"),
          actions: {
            menu: safe(ctx, () => menu(ctx)), model: safe(ctx, () => selectModel(ctx)),
            commands: safe(ctx, async () => { if (!ctx.ui.getEditorText().trim() || await ctx.ui.confirm("Открыть команды?", "Заменить текст в поле ввода на поиск команд?")) ctx.ui.setEditorText("/"); }),
            details: () => ctx.ui.setToolsExpanded(!ctx.ui.getToolsExpanded()),
          },
        });
        return workspace.editor;
      });
    }
    clearTimeout(startupTimer);
    if (!pi.getFlag("friendly-no-welcome") && (!_event.reason || _event.reason === "startup")) startupTimer = setTimeout(() => { void safe(ctx, () => menu(ctx))(); }, 0);
  });
  pi.on("session_shutdown", () => {
    stopped = true; clearTimeout(startupTimer); activeMenu?.dispose(); workspace?.dispose(); workspace = undefined;
  });
}
