import { createBillingUI } from "./billing-ui.js";
import { createVersionManager } from "./message-versions.js";
import { splitAttachments, buildOutgoingText } from "./attachments.js";

const billingUI = createBillingUI();
const versionManager = createVersionManager();
const $ = (id) => document.getElementById(id);

/* ============================== icons ============================== */

const paths = {
  plus: "M12 5v14M5 12h14",
  folder:
    "M3 7V5a2 2 0 0 1 2-2h4l3 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm0 0h9",
  wallet:
    "M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6m18 7h-5v4h5",
  moon: "M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0-6v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5",
  exit: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9",
  search: "M21 21l-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0",
  close: "m6 6 12 12M6 18 18 6",
  arrow: "M5 12h14M14 7l5 5-5 5",
  "arrow-up": "M12 19V5m-6 6 6-6 6 6",
  "chevron-down": "m7 10 5 5 5-5",
  "chevron-right": "m9 6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  copy: "M9 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm6-4H5a2 2 0 0 0-2 2v10",
  edit: "m11 4 10 10-10 1-1-10 1-1Zm0 0L7 8m8 8-4 4",
  branch:
    "M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12-15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 6a9 9 0 0 1-9 9",
  prev: "m15 18-6-6 6-6",
  next: "m9 18 6-6-6-6",
  attach:
    "m20 11-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6",
  stop: "M7 7h10v10H7z",
  refresh: "M20 7v-4l-4 1 M20 7a8 8 0 1 0 1 9",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6",
  home: "M3 11 12 3l9 8M5 10v11h14V10",
  desktop: "M3 4h18v12H3zM8 20h8M12 16v4",
  download: "M12 3v12m-5-5 5 5 5-5M4 21h16",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  archive: "M21 8v13H3V8M1 3h22v5H1zM10 12h4",
  warning: "M12 3 2 21h20L12 3Zm0 6v5m0 4h.01",
};

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name] || paths.file);
  svg.append(path);
  return svg;
}

function hydrateIcons(root = document) {
  for (const node of root.querySelectorAll("[data-icon]")) {
    node.replaceChildren(icon(node.dataset.icon));
  }
}

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

/* ============================== state ============================== */

let page = "projects";
let projectId = null;
let catalog = [];
let catalogLoading = true;
let catalogError = "";
let state = {};
let source;
let connected = false;
let booting = true;
let pending = 0;
let operationLabel = "";
let uploading = false;
let editingIndex = null;
let queueCollapsed = false;
let editingQueueIndex = null;
let queueEditDraft = "";
let queueEditAttachments = [];
let attachments = [];
let pendingChatDelete = null;
try {
  queueCollapsed = localStorage.getItem("pf-queue-collapsed") === "1";
} catch {}
let searchValue = "";
let searchOpen = false;
let renderedSignature = "";
let queueSignature = "";
let lastChat;
let questionId;
let dictationId;
let modelList = [];
let modelsLoaded = false;
let modelsLoading = false;
let modelsError = "";
let modelRetryAfter = 0;
let clockBase = 0;
let clockAt = 0;
let clockRequest;
let reconnectAttempts = 0;
let reconnectTimer;
let hintTimer;
let progressValue = 0;
let progressTimer;
let progressHideTimer;
let progressActive = false;
const modelMenu = el("div", null, "model-menu");
modelMenu.id = "model-menu";
modelMenu.setAttribute("popover", "auto");
modelMenu.setAttribute("role", "dialog");
modelMenu.setAttribute("aria-label", "Выбор модели");
document.body.append(modelMenu);

const draftKey = (id) => "pf-draft-" + (id || "new");
function saved(id) {
  try {
    return localStorage.getItem(draftKey(id)) || "";
  } catch {
    return "";
  }
}
function store(id, text) {
  try {
    localStorage.setItem(draftKey(id), text);
  } catch {}
}

/* ============================== utilities ============================== */

function plural(n, one, few, many) {
  const mod = n % 100;
  return (
    n +
    " " +
    (mod >= 11 && mod <= 14 ? many : n % 10 === 1 ? one : n % 10 >= 2 && n % 10 <= 4 ? few : many)
  );
}
function projectOf(id) {
  return catalog.find((project) => project.id === id);
}
function activeProjectId() {
  return projectId || state.active?.projectId || null;
}
function branchList() {
  return projectOf(activeProjectId())?.chats || [];
}
function queueOf() {
  return state.queue || { steering: [], followUp: [] };
}

function showHint(text, error = false) {
  clearTimeout(hintTimer);
  $("ui-hint").textContent = text || "";
  $("ui-hint").hidden = !text;
  $("ui-hint").classList.toggle("error", Boolean(error));
  hintTimer = setTimeout(() => {
    $("ui-hint").hidden = true;
  }, error ? 8000 : 5000);
}
function showError(text) {
  if ($("error-text").textContent !== (text || "")) $("error").open = false;
  $("error-text").textContent = text || "";
  $("error").hidden = !text;
}

function beginTask(label) {
  pending += 1;
  if (label) operationLabel = label;
  renderProgress();
}
function endTask() {
  pending = Math.max(0, pending - 1);
  if (!pending) operationLabel = "";
  renderProgress();
  renderStatus();
}
function run(label, fn) {
  return (async () => {
    beginTask(label);
    try {
      return await fn();
    } catch (error) {
      showHint(error.message || "Не удалось выполнить действие.", true);
      return undefined;
    } finally {
      endTask();
    }
  })();
}

async function api(path, data, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch("/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error("Сервер вернул некорректный ответ.");
    }
    if (!response.ok) throw new Error(value.error || "Не удалось выполнить действие.");
    return value;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error(`pi не ответил за ${Math.round(timeout / 1000)} с. Попробуйте ещё раз.`);
    if (!navigator.onLine) throw new Error("Нет сети. Проверьте подключение.");
    if (/Failed to fetch|NetworkError|load failed/i.test(error.message))
      throw new Error("Нет соединения с pi. Убедитесь, что программа запущена.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function canSwitch() {
  if (
    state.busy ||
    state.loading ||
    uploading ||
    ["starting", "recording", "transcribing"].includes(state.voice?.phase)
  ) {
    showHint("Дождитесь завершения действия или остановите ответ.", true);
    return false;
  }
  return true;
}

function paintProgress(value) {
  const span = $("progress-bar").querySelector("span");
  if (span) span.style.width = value + "%";
}
function startProgress() {
  if (progressActive) return;
  clearTimeout(progressHideTimer);
  progressActive = true;
  if (progressValue >= 100) progressValue = 6;
  progressValue = Math.max(progressValue, 6);
  $("progress-bar").hidden = false;
  $("progress-bar").classList.remove("done");
  paintProgress(progressValue);
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!progressActive) return;
    // Move quickly at first, then slow down near the end.
    progressValue = Math.min(92, progressValue + Math.max(0.7, (92 - progressValue) * 0.07));
    paintProgress(progressValue);
  }, 180);
}
function stopProgress() {
  if (!progressActive) {
    $("progress-bar").hidden = true;
    return;
  }
  progressActive = false;
  clearInterval(progressTimer);
  progressValue = 100;
  $("progress-bar").classList.add("done");
  paintProgress(100);
  clearTimeout(progressHideTimer);
  progressHideTimer = setTimeout(() => {
    if (progressActive) return;
    $("progress-bar").hidden = true;
    $("progress-bar").classList.remove("done");
    progressValue = 0;
    paintProgress(0);
  }, 220);
}
function renderProgress() {
  const active = Boolean(pending || booting || state.loading || uploading);
  if (active) startProgress();
  else stopProgress();
}

/* ============================== markdown ============================== */

function inlineMarkdown(parent, text) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    if (token.startsWith("`")) parent.append(el("code", token.slice(1, -1)));
    else if (token.startsWith("**")) parent.append(el("strong", token.slice(2, -2)));
    else {
      const parsed = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const link = el("a", parsed[1]);
      link.href = parsed[2];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.append(link);
    }
    last = match.index + token.length;
  }
  parent.append(document.createTextNode(text.slice(last)));
}

function markdown(parent, text) {
  let code = null;
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (!paragraph.length) return;
    const p = el("p");
    inlineMarkdown(p, paragraph.join("\n"));
    parent.append(p);
    paragraph = [];
  };
  for (const line of String(text || "").split("\n")) {
    if (line.startsWith("```")) {
      flush();
      list = null;
      if (code) {
        parent.append(code);
        code = null;
      } else {
        code = el("pre");
        code.textContent = "";
      }
      continue;
    }
    if (code) {
      code.textContent += line + "\n";
      continue;
    }
    if (!line.trim()) {
      flush();
      list = null;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)/.exec(line);
    const item = /^\s*(?:([-*+])|\d+[.)])\s+(.*)/.exec(line);
    if (heading) {
      flush();
      list = null;
      const node = el("h" + Math.min(4, heading[1].length + 1));
      inlineMarkdown(node, heading[2]);
      parent.append(node);
      continue;
    }
    if (item) {
      flush();
      const tag = item[1] ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = el(tag);
        if (tag === "ol") list.start = parseInt(line, 10) || 1;
        parent.append(list);
      }
      const li = el("li");
      inlineMarkdown(li, item[2]);
      list.append(li);
      continue;
    }
    list = null;
    paragraph.push(line);
  }
  flush();
  if (code) parent.append(code);
}

/* ============================== boot / events ============================== */

async function loadCatalog() {
  catalogLoading = true;
  renderProgress();
  let failure;
  try {
    const data = await api("catalog", undefined, 30000);
    catalog = data.projects || [];
    catalogError = "";
  } catch (error) {
    catalogError = error.message;
    failure = error;
  } finally {
    catalogLoading = false;
    renderProgress();
  }
  if (page === "projects" || page === "chats") {
    const search = $("list-search");
    if (!search || document.activeElement !== search) renderRoute();
  } else {
    renderBranches();
  }
  if (failure) throw failure;
}

function connectEvents() {
  clearTimeout(reconnectTimer);
  if (source) source.close();
  source = new EventSource("/api/events");
  source.onopen = () => {
    connected = true;
    reconnectAttempts = 0;
    booting = false;
    renderConnection();
    renderProgress();
    renderStatus();
  };
  source.onmessage = (event) => {
    let next;
    try {
      next = JSON.parse(event.data);
    } catch {
      return;
    }
    applyState(next);
  };
  source.onerror = () => {
    connected = false;
    reconnectAttempts += 1;
    renderConnection();
    renderStatus();
    if (reconnectAttempts >= 2) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectEvents, 2500);
    }
  };
}

function renderConnection() {
  const node = $("connection");
  node.hidden = connected;
  node.classList.toggle("offline", !connected);
  node.classList.toggle("error", !connected && reconnectAttempts > 4);
  if (connected) return;
  node.replaceChildren(
    el("span", null, "dot"),
    document.createTextNode(
      reconnectAttempts
        ? reconnectAttempts > 4
          ? "Нет связи с pi"
          : "Переподключение…"
        : "Подключение…",
    ),
  );
}

async function boot() {
  hydrateIcons();
  wireChrome();
  renderRoute();
  renderProgress();
  beginTask("Подключаюсь к pi…");
  try {
    const token = location.hash.slice(1);
    if (token) {
      await api("auth", { token }, 15000);
      history.replaceState(null, "", location.pathname);
    }
    await loadCatalog();
  } catch (error) {
    catalogError = error.message;
    showHint(error.message, true);
    renderRoute();
  } finally {
    booting = false;
    endTask();
  }
  connectEvents();
}

/* ============================== chrome ============================== */

function wireChrome() {
  $("nav-projects").onclick = () => navigate("projects");
  $("return-chat").onclick = () => {
    if (!state.active) return;
    const project = projectOf(state.active.projectId);
    if (project) projectId = project.id;
    page = "chat";
    renderRoute();
  };
  $("theme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("exit").onclick = () => {
    if (!$("exit").disabled) $("exit-dialog").showModal();
  };
  $("cancel-exit").onclick = () => $("exit-dialog").close();
  $("confirm-exit").onclick = () =>
    run("Завершаю работу…", async () => {
      await api("close", {}, 15000);
      source?.close();
      connected = false;
      $("exit-dialog").close();
      $("connection").textContent = "Работа завершена";
      $("connection").hidden = false;
      renderStatus();
      showHint("pi завершён. Вкладку можно закрыть.");
      setTimeout(() => window.close(), 250);
    });
  $("billing-open").setAttribute("aria-label", "Баланс и пополнение");
  const brand = document.querySelector(".brand");
  brand.onclick = (event) => {
    event.preventDefault();
    navigate("projects");
  };
  $("composer").onsubmit = (event) => {
    event.preventDefault();
    const text = $("draft").value;
    if (!text.trim() && !attachments.length) return;
    if (state.busy) queueMessage(text);
    else sendMessage(text);
  };
  $("draft").oninput = () => {
    store(state.active?.id, $("draft").value);
    autoGrow();
    renderStatus();
  };
  $("draft").onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (state.voice?.phase === "recording")
        run("Завершаю запись…", () => api("voice", { chat: state.active?.id }, 20000));
      else if (state.busy) queueMessage($("draft").value);
      else $("composer").requestSubmit();
    }
  };
  $("send").onclick = (event) => {
    event.preventDefault();
    if (state.busy) abortGeneration();
    else $("composer").requestSubmit();
  };
  $("model-select").onclick = () => {
    positionModels();
    modelMenu.togglePopover();
  };
  modelMenu.addEventListener("toggle", () => {
    $("model-select").setAttribute("aria-expanded", String(modelMenu.matches(":popover-open")));
    if (modelMenu.matches(":popover-open")) loadModels();
  });
  $("attach").onclick = () => {
    if (!$("attach").disabled) pickAttachments();
  };
  $("mic").onclick = () =>
    run("Переключаю микрофон…", async () => {
      if (["installing", "downloading", "loading"].includes(state.voice?.phase)) {
        $("voice-setup").classList.add("highlight");
        setTimeout(() => $("voice-setup").classList.remove("highlight"), 2500);
        throw new Error("Дождитесь загрузки голосовой модели.");
      }
      await api("voice", { chat: state.active?.id }, 20000);
    });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      state.busy &&
      !$("draft").value.trim() &&
      !state.questions?.length &&
      !document.querySelector("dialog[open]")
    ) {
      abortGeneration();
    }
  });
  window.addEventListener("resize", () => {
    if (modelMenu.matches(":popover-open")) positionModels();
  });
  window.addEventListener("beforeunload", () => store(state.active?.id, $("draft").value));

  $("folder-path-form").onsubmit = (event) => {
    event.preventDefault();
    browseFolders($("folder-path").value);
  };
  $("chat-confirm-cancel").onclick = () => {
    $("chat-confirm").close();
    pendingChatDelete = null;
  };
  $("chat-confirm-ok").onclick = () => confirmDeleteChat();
  $("chat-confirm").addEventListener("close", () => {
    pendingChatDelete = null;
  });
  $("folder-close").onclick = () => $("folder-dialog").close();
  $("folder-cancel").onclick = () => $("folder-dialog").close();
  $("folder-choose").onclick = () => chooseFolder();
  $("folder-dialog").addEventListener("close", () => {
    browserRequest += 1;
    browserChosen = null;
  });

  try {
    setTheme(localStorage.getItem("pf-theme") || "light", false);
  } catch {
    setTheme("light", false);
  }
  renderAttachments();
}

function setTheme(value, persist = true) {
  document.documentElement.dataset.theme = value;
  const dark = value === "dark";
  $("theme").replaceChildren(icon(dark ? "sun" : "moon"));
  $("theme").title = dark ? "Светлая тема" : "Тёмная тема";
  $("theme").setAttribute("aria-label", $("theme").title);
  if (persist) {
    try {
      localStorage.setItem("pf-theme", value);
    } catch {}
  }
}

/* ============================== navigation ============================== */

function navigate(target) {
  if (pending && target === "projects" && state.loading) return;
  store(state.active?.id, $("draft").value);
  searchValue = "";
  searchOpen = false;
  if (target === "projects") {
    projectId = null;
    page = "projects";
    renderRoute();
    loadCatalog().catch(() => {});
    return;
  }
  if (target === "new") return newBranch();
  page = target;
  renderRoute();
}

function openProject(project) {
  projectId = project.id;
  page = "chats";
  searchValue = "";
  searchOpen = false;
  renderRoute();
  api("open-project", { project: project.id }, 30000).catch(() => {});
}

function openBranch(chat) {
  if (!canSwitch()) return;
  const previous = { page, state };
  if (state.active) {
    page = "chat";
    state = { ...state, loading: true, messages: [] };
  } else {
    // No active chat yet: keep the chats list visible until pi returns the session.
    page = "chats";
  }
  renderRoute();
  beginTask("Открываю чат…");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    endTask();
  };
  api("open", { id: chat.id }, 45000)
    .then(async (next) => {
      applyState(next);
      page = "chat";
      editingIndex = null;
      finish();
      await loadCatalog();
      renderRoute();
      $("draft").focus();
    })
    .catch((error) => {
      state = previous.state;
      page = previous.page;
      finish();
      renderRoute();
      showHint(error.message, true);
    })
    .finally(finish);
}

function newBranch() {
  const target = activeProjectId();
  if (!target) {
    showHint("Сначала выберите проект.");
    return;
  }
  if (!canSwitch()) return;
  run("Создаю чат…", async () => {
    const next = await api("new-chat", { project: target, fast: true }, 45000);
    applyState(next);
    page = "chat";
    projectId = next.active?.projectId || target;
    editingIndex = null;
    $("draft").value = "";
    store(next.active?.id, "");
    loadCatalog().catch(() => {});
    renderRoute();
    autoGrow();
    $("draft").focus();
    showHint("Новый чат создан.");
  });
}

function openCreateProject() {
  if (!canSwitch()) return;
  page = "create";
  renderRoute();
}

async function openFolderDialog() {
  if (!canSwitch()) return;
  browserChosen = null;
  $("folder-choose").disabled = true;
  $("folder-dialog").showModal();
  await browseFolders(browserPath);
}

/* ============================== branches ============================== */

function renderReturnChat() {
  const button = $("return-chat");
  if (!state.active || page === "chat") {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.classList.toggle("busy", Boolean(state.busy));
  const name = state.active.name || "Текущий чат";
  $("return-chat-name").textContent = state.busy ? `${name} · идёт ответ` : name;
}

function renderRecentProjects() {
  const panel = $("recent-projects");
  const list = $("recent-project-list");
  const currentId = activeProjectId();
  const current = projectOf(currentId);
  const others = catalog.filter((project) => project.id !== currentId).slice(0, 3);
  const projects = current ? [current, ...others] : catalog.slice(0, 4);
  panel.hidden = !projects.length;
  list.replaceChildren();
  for (const project of projects) {
    const row = el("button", null, "recent-project" + (project.id === currentId ? " active" : ""));
    row.type = "button";
    row.title = project.name;
    const iconNode = icon("folder");
    row.append(iconNode, el("span", project.name, "recent-project-name"));
    row.onclick = () => openProject(project);
    list.append(row);
  }
}

function renderBranches() {
  renderReturnChat();
  renderRecentProjects();
  const project = projectOf(activeProjectId());
  const panel = $("branches-panel");
  if (!project) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const list = $("branch-list");
  list.replaceChildren();
  const create = el("button", null, "branch-row branch-create");
  create.type = "button";
  create.title = "Создать новый чат";
  create.disabled = Boolean(state.busy);
  create.append(icon("plus"), el("span", "Создать чат", "branch-name"));
  create.onclick = () => newBranch();
  list.append(create);
  for (const chat of project.chats || []) {
    const active = chat.id === state.active?.id;
    const row = el("div", null, "branch-row has-actions" + (active ? " active" : ""));
    row.setAttribute("role", "listitem");
    const open = el("button", null, "branch-open");
    open.type = "button";
    open.disabled = Boolean(state.busy) && !active;
    open.title = open.disabled
      ? "Остановите ответ, чтобы переключить чат"
      : chat.name || "Чат";
    const branchIcon = icon("branch");
    branchIcon.classList.add("branch-icon");
    const copy = el("span", null, "branch-copy");
    copy.append(el("span", chat.name || "Новый чат", "branch-name"));
    open.append(branchIcon, copy);
    open.onclick = () => {
      if (active) {
        if (page !== "chat") {
          page = "chat";
          renderRoute();
        }
        return;
      }
      openBranch(chat);
    };
    const actions = el("div", null, "branch-actions");
    const archive = iconAction("archive", "Архивировать", () => archiveChat(chat), "branch-action");
    archive.disabled = Boolean(state.busy) || chat.terminal;
    const remove = iconAction("trash", "Удалить", () => deleteChat(chat), "branch-action danger");
    remove.disabled = Boolean(state.busy) || chat.terminal;
    actions.append(archive, remove);
    row.append(open, actions);
    list.append(row);
  }
}

function archiveChat(chat) {
  if (state.busy) {
    showHint("Сначала остановите ответ.", true);
    return;
  }
  const projectIdBefore = activeProjectId();
  const wasActive = chat.id === state.active?.id;
  run("Архивирую чат…", async () => {
    const result = await api("archive-chat", { chat: chat.id }, 30000);
    catalog = result.projects || catalog;
    if (wasActive) {
      state = { ...state, active: null, messages: [], busy: false };
      projectId = projectIdBefore;
      page = "chats";
    }
    renderRoute();
    showHint("Чат перемещён в архив.");
  });
}

function deleteChat(chat) {
  if (state.busy) {
    showHint("Сначала остановите ответ.", true);
    return;
  }
  pendingChatDelete = chat;
  $("chat-confirm-title").textContent = "Удалить чат?";
  $("chat-confirm-text").textContent = `«${chat.name || "Чат"}» будет удалён вместе с файлом переписки. Это действие нельзя отменить.`;
  $("chat-confirm").showModal();
}

function confirmDeleteChat() {
  const chat = pendingChatDelete;
  if (!chat) return;
  $("chat-confirm").close();
  pendingChatDelete = null;
  const projectIdBefore = activeProjectId();
  const wasActive = chat.id === state.active?.id;
  run("Удаляю чат…", async () => {
    const result = await api("delete-chat", { chat: chat.id }, 30000);
    catalog = result.projects || catalog;
    if (wasActive) {
      state = { ...state, active: null, messages: [], busy: false };
      projectId = projectIdBefore;
      page = "chats";
    }
    renderRoute();
    showHint("Чат удалён.");
  });
}

/* ============================== page rendering ============================== */

function setBreadcrumb(title) {
  $("breadcrumb").textContent = title;
}

function renderRoute() {
  if (page === "chat" && !state.active) page = "chats";
  const chatPage = page === "chat" && state.active;
  $("page").hidden = chatPage;
  $("chat").hidden = !chatPage;
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.nav === "projects" && ["projects", "chats", "create"].includes(page),
    );
  });
  renderBranches();
  if (chatPage) {
    const project = projectOf(state.active.projectId || projectId);
    setBreadcrumb(state.active.name || "Чат");
    renderChat();
    return;
  }
  if (page === "create") {
    setBreadcrumb("Новый проект");
    renderCreatePage();
    return;
  }
  if (page === "chats") {
    const project = projectOf(projectId);
    setBreadcrumb(project?.name || "Проект");
    renderChatsPage(project);
    return;
  }
  setBreadcrumb("Проекты");
  renderProjectsPage();
}

function pageShell(title, subtitle, toolbar) {
  const root = el("div", null, "page-inner");
  const head = el("div", null, "page-head");
  const copy = el("div");
  copy.append(el("h1", title));
  if (subtitle) copy.append(el("p", subtitle, "page-sub"));
  head.append(copy);
  root.append(head);
  if (toolbar) root.append(toolbar);
  $("page").replaceChildren(root);
  return root;
}

function searchField(placeholder, onInput) {
  const input = el("input", null, "search");
  input.type = "search";
  input.id = "list-search";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
  input.value = searchValue;
  input.oninput = () => {
    searchValue = input.value;
    onInput(input.value);
  };
  input.onkeydown = (event) => {
    if (event.key === "Escape") {
      searchOpen = false;
      input.hidden = true;
      renderRoute();
    }
  };
  return input;
}

function listToolbar(placeholder, renderList, { create = null, folder = null, branch = null } = {}) {
  const toolbar = el("div", null, "toolbar");
  const search = searchField(placeholder, renderList);
  search.hidden = !searchOpen;
  const toggle = el("button", null, "button search-toggle");
  toggle.type = "button";
  toggle.append(icon("search"));
  toggle.title = "Поиск";
  toggle.setAttribute("aria-label", "Поиск");
  toggle.setAttribute("aria-expanded", String(searchOpen));
  toggle.onclick = () => {
    searchOpen = !searchOpen;
    search.hidden = !searchOpen;
    toggle.setAttribute("aria-expanded", String(searchOpen));
    if (searchOpen) search.focus();
    else {
      searchValue = "";
      search.value = "";
      renderList("");
      toggle.focus();
    }
  };
  toolbar.append(search);
    if (folder) {
      const button = el("button", null, "button ghost");
      button.type = "button";
      button.append(icon("folder"), el("span", "Выбрать папку"));
      button.onclick = () => openFolderDialog();
      toolbar.append(button);
    }
    const actions = el("div", null, "list-actions");
  actions.style.display = "flex";
  actions.style.gap = "6px";
  actions.append(toggle);
  if (branch) {
    const button = el("button", null, "button primary");
    button.type = "button";
    button.append(icon("plus"), el("span", "Новый чат"));
    button.disabled = Boolean(state.busy);
    button.onclick = () => newBranch();
    actions.append(button);
  }
  if (create) {
    const button = el("button", null, "button primary");
    button.type = "button";
    button.append(icon("plus"), el("span", "Новый проект"));
    button.onclick = create.run;
    actions.append(button);
  }
  toolbar.append(actions);
  return { toolbar, search };
}

function skeletonList(rows = 4) {
  const list = el("div", null, "skeleton-list");
  for (let index = 0; index < rows; index += 1) {
    const row = el("div", null, "skeleton-row");
    const block = el("span", null, `skeleton w-${index % 2 ? 60 : 40}`);
    const meta = el("span", null, "skeleton w-40");
    meta.style.marginLeft = "auto";
    row.append(block, meta);
    list.append(row);
  }
  return list;
}

function emptyState(title, text, action) {
  const empty = el("div", null, "empty");
  empty.append(el("h2", title), el("p", text));
  if (action) {
    const button = el("button", action.label, "button" + (action.primary ? " primary" : ""));
    button.type = "button";
    button.onclick = action.run;
    empty.append(button);
  }
  return empty;
}

function renderProjectsPage() {
  const root = pageShell(
    "Проекты",
    "Проект — папка с файлами. Внутри проекта можно вести несколько независимых чатов.",
  );
  const renderList = (query = searchValue) => {
    const list = el("div", null, "list");
    const term = query.trim().toLocaleLowerCase();
    const projects = catalog.filter((project) =>
      (project.name + " " + (project.folder || "")).toLocaleLowerCase().includes(term),
    );
    if (!projects.length) {
      list.append(
        emptyState(
          term ? "Ничего не найдено" : "Начните с первого проекта",
          term ? "Попробуйте другое название или путь." : "Проект объединяет файлы и чаты одной задачи.",
          term ? null : { label: "Новый проект", primary: true, run: openCreateProject },
        ),
      );
    }
    for (const project of projects) {
      const row = el("button", null, "row-item");
      row.type = "button";
      row.append(icon("folder"));
      const copy = el("span", null, "row-copy");
      copy.append(el("strong", project.name));
      copy.append(el("small", plural(project.chats?.length || 0, "чат", "чата", "чатов")));
      row.append(copy, icon("arrow"));
      row.onclick = () => openProject(project);
      list.append(row);
    }
    const container = $("project-list");
    if (container) container.replaceChildren(catalogLoading ? skeletonList() : list);
  };
  const { toolbar } = listToolbar("Найти проект…", renderList, {
    folder: true,
    create: { run: openCreateProject },
  });
  root.append(toolbar);
  const list = el("div");
  list.id = "project-list";
  list.append(catalogLoading ? skeletonList() : el("div"));
  root.append(list);
  if (catalogError) {
    root.append(
      emptyState("Не удалось загрузить проекты", catalogError, {
        label: "Повторить",
        run: () => run("Загружаю проекты…", () => loadCatalog()),
      }),
    );
  }
  renderList();
}

function renderChatsPage(project) {
  if (!project) {
    page = "projects";
    renderProjectsPage();
    return;
  }
  const root = pageShell(project.name, "Файлы и чаты проекта.");
  const renderList = (query = searchValue) => {
    const list = el("div", null, "list");
    const term = query.trim().toLocaleLowerCase();
    const chats = (project.chats || []).filter((chat) =>
      (chat.name || "").toLocaleLowerCase().includes(term),
    );
    for (const chat of chats) {
      const row = el("button", null, "row-item" + (chat.id === state.active?.id ? " selected" : ""));
      row.type = "button";
      row.append(icon("branch"));
      const copy = el("span", null, "row-copy");
      copy.append(el("strong", chat.name || "Новый чат"));
      copy.append(
        el("small", plural(chat.count || 0, "сообщение", "сообщения", "сообщений")),
      );
      row.append(copy, icon("arrow"));
      row.onclick = () => {
        if (chat.id === state.active?.id) {
          page = "chat";
          renderRoute();
          return;
        }
        openBranch(chat);
      };
      list.append(row);
    }
    if (!chats.length) {
      list.append(
        emptyState(
          term ? "Ничего не найдено" : "Пока нет чатов",
          term ? "Попробуйте другое название." : "Создайте чат — он будет хранить свою переписку.",
          term ? null : { label: "Новый чат", primary: true, run: newBranch },
        ),
      );
    }
    const container = $("chat-list");
    if (container) container.replaceChildren(list);
  };
  const toolbar = el("div", null, "toolbar");
  const back = el("button", null, "button ghost");
  back.type = "button";
  back.append(icon("prev"), el("span", "Все проекты"));
  back.onclick = () => navigate("projects");
  toolbar.append(back);
  const { toolbar: searchBar, search } = listToolbar("Найти чат…", renderList, {
    branch: true,
  });
  searchBar.append(search);
  toolbar.append(...searchBar.childNodes);
  root.append(toolbar);
  const list = el("div");
  list.id = "chat-list";
  list.append(el("div"));
  root.append(list);
  renderList();
}

function renderCreatePage() {
  const back = el("button", null, "back");
  back.type = "button";
  back.append(icon("prev"), el("span", "Все проекты"));
  back.onclick = () => navigate("projects");
  const root = pageShell("Новый проект", "Для файлов задачи будет создана отдельная папка.");
  root.prepend(back);
  const form = el("form", null, "form");
  const label = el("label", "Название проекта");
  label.htmlFor = "project-name";
  const input = el("input");
  input.id = "project-name";
  input.placeholder = "Например, сайт пекарни";
  input.maxLength = 60;
  input.required = true;
  input.autocomplete = "off";
  const error = el("div", null, "form-error");
  error.setAttribute("role", "alert");
  const actions = el("div", null, "form-actions");
  const submit = el("button", "Создать проект", "button primary");
  submit.type = "submit";
  const cancel = el("button", "Отмена", "button");
  cancel.type = "button";
  cancel.onclick = () => navigate("projects");
  actions.append(submit, cancel);
  form.append(label, input, error, actions);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      error.textContent = "Введите название проекта.";
      input.focus();
      return;
    }
    submit.disabled = true;
    run("Создаю проект…", async () => {
      const next = await api("create-project", { name: input.value, fast: true }, 45000);
      applyState(next);
      page = "chat";
      projectId = next.active?.projectId || null;
      loadCatalog().catch(() => {});
      renderRoute();
    }).finally(() => {
      submit.disabled = false;
    });
  };
  root.append(form);
  input.focus();
}

/* ============================== chat rendering ============================== */

function renderChat() {
  if (state.loading) {
    renderChatSkeleton();
  } else {
    renderMessages();
  }
  renderQueue();
  renderStatus();
  autoGrow();
}

function renderChatSkeleton() {
  const area = $("messages");
  const wrap = el("div", null, "chat-loading");
  const user = el("div", null, "user-line");
  const bubble = el("div");
  bubble.style.width = "42%";
  bubble.append(el("span", null, "skeleton w-80"));
  user.append(bubble);
  wrap.append(user);
  for (let index = 0; index < 2; index += 1) {
    const row = el("div", null, "message");
    const mark = el("div", null, "assistant-mark");
    mark.textContent = "π";
    const body = el("div");
    body.style.flex = "1";
    body.append(el("span", null, "skeleton w-60"), el("span", null, "skeleton w-80"), el("span", null, "skeleton w-40"));
    body.style.display = "grid";
    body.style.gap = "7px";
    row.append(mark, body);
    wrap.append(row);
  }
  wrap.append(el("div", "Открываю чат…", "stream-label"));
  area.replaceChildren(wrap);
}

function messageSignature() {
  return JSON.stringify([
    state.messages || [],
    Boolean(state.busy),
    editingIndex,
    state.active?.readOnly,
    state.active?.id,
  ]);
}

function renderMessages() {
  if (page !== "chat") return;
  const signature = messageSignature();
  if (signature === renderedSignature) return;
  renderedSignature = signature;
  const area = $("messages");
  const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 120;
  const oldTop = area.scrollTop;
  const frag = document.createDocumentFragment();
  const messages = state.messages || [];
  let previousAssistant = false;

  messages.forEach((message, index) => {
    if (
      !message.text &&
      !message.thinking &&
      !message.tools?.length &&
      !message.error &&
      message.status !== "streaming"
    )
      return;
    const user = message.role === "user";
    if (user) previousAssistant = false;
    const continued = !user && previousAssistant;
    const nextUser = messages.findIndex((item, position) => position > index && item.role === "user");
    const historical = nextUser >= 0;
    const recovered = messages
      .slice(index + 1, historical ? nextUser : undefined)
      .some((item) => item.role === "assistant" && !item.error && (item.text || item.tools?.length));
    const showFailure = message.error && !recovered && (historical || !state.busy);
    if (message.error && !showFailure && !message.text && !message.thinking && !message.tools?.length)
      return;

    const row = el("article", null, "message " + (user ? "user" : "assistant") + (continued ? " continued" : ""));
    row.dataset.index = String(index);
    const messageKey = (state.active?.id || "") + ":" + index;

    if (user) {
      const wrapper = el("div", null, "user-message-wrapper");
      if (editingIndex === index) {
        wrapper.append(editBox(message, index));
      } else {
        const parsed = splitAttachments(message.text || "");
        const bubble = el("div", null, "user-bubble");
        if (parsed.text) markdown(bubble, parsed.text);
        if (parsed.attachments.length) bubble.append(attachmentChips(parsed.attachments, false));
        wrapper.append(bubble);
        if (!state.busy && !state.active?.readOnly && !state.active?.host) {
          const controls = el("div", null, "message-controls");
          const edit = el("button", null, "message-control");
          edit.type = "button";
          edit.title = "Редактировать в новой ветке (новый чат)";
          edit.append(icon("edit"), el("span", "Изменить"));
          edit.onclick = () => {
            editingIndex = index;
            renderMessages();
          };
          const branch = el("button", null, "message-control");
          branch.type = "button";
          branch.title = "Создать ветку от этого сообщения (новый чат)";
          branch.append(icon("branch"), el("span", "Ветка отсюда"));
          branch.onclick = () => forkMessage(index, "");
          const copy = el("button", null, "message-control");
          copy.type = "button";
          copy.title = "Скопировать";
          copy.append(icon("copy"), el("span", "Копировать"));
          copy.onclick = () => copyText(message.text || "");
          controls.append(edit, branch, copy);
          wrapper.append(controls);
        }
      }
      row.append(wrapper);
    } else {
      const mark = el("div", null, "assistant-mark");
      mark.textContent = "π";
      const content = el("div", null, "assistant-body");
      if (message.thinking) {
        const body = el("div", null, "reasoning-text");
        markdown(body, message.thinking);
        content.append(
          disclosure(
            message.status === "streaming" && !message.text ? "Размышляет…" : "Размышления",
            body,
            "reasoning",
            message.status === "streaming" ? { label: "идёт", cls: "warn" } : null,
            messageKey + ":thinking",
          ),
        );
      }
      const answer = el("div", null, "answer");
      markdown(answer, message.text || "");
      if (message.status === "streaming" && message.text) {
        const caret = el("span", "▍", "typing-caret");
        caret.setAttribute("aria-hidden", "true");
        answer.append(caret);
      }
      content.append(answer);
      if (message.status === "streaming" && !message.text && !message.thinking && !message.tools?.length) {
        content.append(el("div", "Пишет ответ…", "generating-message"));
        const skeleton = el("div", null, "stream-skeleton");
        skeleton.append(el("span", null, "skeleton w-80"), el("span", null, "skeleton w-60"));
        content.append(skeleton);
      } else if (message.status === "streaming" && !message.text) {
        content.append(el("div", "Пишет ответ…", "generating-message"));
      }
      for (const tool of message.tools || []) {
        const status = tool.status || "pending";
        const labels = { pending: "ожидает", running: "выполняется", done: "готово", error: "ошибка", stopped: "остановлено" };
        const body = el("div", null, "tool-detail");
        if (tool.path) body.append(el("p", tool.path, "file-path"));
        if (tool.command) body.append(el("pre", tool.command));
        if (tool.output) body.append(el("pre", tool.output));
        if (!body.childNodes.length)
          body.append(el("p", status === "running" ? "Ожидаю результат…" : "Дополнительных сведений нет."));
        const label = status === "done"
          ? String(tool.label || "Действие").replace("Создаю файл", "Файл записан").replace("Обновляю файл", "Файл изменён").replace("Читаю файл", "Файл прочитан")
          : tool.label || "Действие";
        content.append(
          disclosure(
            label,
            body,
            "tool-card " + status,
            {
              label: labels[status] || status,
              cls: status === "error" ? "err" : status === "done" ? "ok" : status === "running" ? "warn" : "",
              dot: true,
            },
            messageKey + ":tool:" + (tool.id || tool.label || "tool"),
          ),
        );
      }
      if (showFailure) {
        content.append(
          disclosure(
            "Не удалось получить ответ · Подробнее",
            el("pre", message.error),
            "message-error",
            null,
            messageKey + ":error",
          ),
        );
      }
      if (message.status === "stopped") content.append(el("p", "Ответ прерван. Полученная часть сохранена.", "stopped-note"));
      if (message.retained) content.append(el("p", "Сохранённый фрагмент: сервис не вернул его в итоговой истории.", "stopped-note"));
      if (message.versions?.length) {
        const body = el("div");
        for (const version of message.versions) body.append(el("pre", version.text || version.thinking || ""));
        content.append(
          disclosure(
            "Предыдущий фрагмент ответа · сервис заменил текст",
            body,
            "reasoning",
            null,
            messageKey + ":versions",
          ),
        );
      }
      const foot = el("div", null, "assistant-foot");
      if (message.status !== "streaming" && message.text) {
        const copy = el("button", null, "copy-btn");
        copy.type = "button";
        copy.append(icon("copy"), el("span", "Копировать"));
        copy.onclick = () => copyText(message.text);
        foot.append(copy);
      }
      if (foot.childNodes.length) content.append(foot);
      if (!continued) row.append(mark);
      row.append(content);
      previousAssistant = true;
    }
    frag.append(row);
  });

  if (!frag.childNodes.length) {
    const welcome = el("div", null, "welcome");
    const mark = el("div", "π", "welcome-mark");
    welcome.append(mark, el("h2", "Чем помочь?"), el("p", "Опишите задачу — файлы появятся в папке проекта."));
    area.replaceChildren(welcome);
  } else {
    area.replaceChildren(frag);
  }
  if (nearBottom && !area.querySelector("details[open]")) area.scrollTop = area.scrollHeight;
  else area.scrollTop = oldTop;
  if (editingIndex != null) {
    const textarea = area.querySelector(".edit-box textarea");
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }
}

function disclosure(label, body, cls = "", badge = null, key = null) {
  const details = el("details", null, cls);
  const stateKey = key || cls + ":" + label;
  details.open = expandedDetails.get(stateKey) || false;
  const summary = el("summary");
  if (badge?.dot) summary.append(el("span", null, "tool-dot"));
  summary.append(el("span", label));
  if (badge && !badge.dot) summary.append(el("span", badge.label, "pill-badge " + (badge.cls || "")));
  summary.onclick = () => expandedDetails.set(stateKey, !details.open);
  details.append(summary, body);
  return details;
}

function editBox(message, index) {
  const parsed = splitAttachments(message.text || "");
  const box = el("div", null, "edit-box");
  const textarea = el("textarea");
  textarea.value = parsed.text;
  textarea.rows = 3;
  textarea.setAttribute("aria-label", "Текст сообщения");
  const note = el("div", "Сохранение создаст новую ветку. Она появится отдельным чатом слева.", "edit-note");
  const actions = el("div", null, "edit-actions");
  const cancel = el("button", "Отмена", "button");
  cancel.type = "button";
  cancel.onclick = () => {
    editingIndex = null;
    renderedSignature = "";
    renderMessages();
  };
  const save = el("button", "Создать ветку", "button primary");
  save.type = "button";
  save.onclick = () => {
    const text = textarea.value.trim();
    if (!text) {
      showHint("Введите текст сообщения.", true);
      return;
    }
    editingIndex = null;
    renderedSignature = "";
    forkMessage(index, buildOutgoingText(text, parsed.attachments));
  };
  actions.append(cancel, save);
  box.append(textarea, note, actions);
  return box;
}


function formatBytes(size) {
  if (!Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) {
    const value = size / 1024;
    return `${value >= 10 ? Math.round(value) : value.toFixed(1).replace(".", ",")} КБ`;
  }
  return `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

function attachmentChips(items, removable = false) {
  const box = el("div", null, "message-attachments");
  items.forEach((item, index) => {
    const card = el("span", null, "attachment-card");
    card.title = item.path;
    const iconBox = el("span", null, "attachment-icon");
    iconBox.append(icon("file"));
    const copy = el("span", null, "attachment-copy");
    const name = item.name || "Файл";
    copy.append(el("span", name, "attachment-name"));
    const extension = name.includes(".") ? name.split(".").pop().toUpperCase().slice(0, 5) : "";
    const meta = [extension, formatBytes(item.size)].filter(Boolean).join(" · ");
    if (meta) copy.append(el("span", meta, "attachment-meta"));
    card.append(iconBox, copy);
    if (removable) {
      const remove = el("button", null, "attachment-remove");
      remove.type = "button";
      remove.title = "Открепить файл";
      remove.setAttribute("aria-label", "Открепить файл");
      remove.append(icon("close"));
      remove.onclick = (event) => {
        event.stopPropagation();
        items.splice(index, 1);
        renderAttachments();
      };
      card.append(remove);
    }
    box.append(card);
  });
  return box;
}

function renderAttachments() {
  const box = $("attachments");
  box.replaceChildren();
  box.hidden = !attachments.length;
  if (attachments.length) box.append(attachmentChips(attachments, true));
  renderStatus();
}

function pickAttachments() {
  if (!connected) {
    showHint("Нет соединения с pi.", true);
    return;
  }
  if (!state.active) {
    showHint("Сначала откройте чат.", true);
    return;
  }
  if (state.active.readOnly) {
    showHint("Этот чат открыт в консоли.", true);
    return;
  }
  run("Выбираю файлы…", async () => {
    const result = await api("pick-attach", {}, 300000);
    const files = result.files || [];
    if (!files.length) return;
    const seen = new Set(attachments.map((item) => item.path.toLowerCase()));
    for (const file of files) {
      if (!file?.path || seen.has(file.path.toLowerCase())) continue;
      seen.add(file.path.toLowerCase());
      attachments.push({
        name: file.name || "Файл",
        path: file.path,
        ...(Number.isFinite(file.size) ? { size: file.size } : {}),
      });
    }
    renderAttachments();
    showHint(
      files.length === 1 ? `Прикреплён файл: ${files[0].name}` : `Прикреплено файлов: ${files.length}`,
    );
  });
}

const expandedDetails = new Map();

function copyText(text) {
  return (async () => {
    try {
      await navigator.clipboard.writeText(text);
      showHint("Скопировано.");
    } catch {
      showHint("Не удалось скопировать.", true);
    }
  })();
}

/* ============================== queue ============================== */

function iconAction(name, title, run, cls = "queue-action") {
  const button = el("button", null, cls);
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.append(icon(name));
  button.onclick = (event) => {
    event.stopPropagation();
    run();
  };
  return button;
}

function renderQueue() {
  const panel = $("queue-panel");
  const queue = queueOf();
  const messages = [...(queue.followUp || [])];
  const signature = JSON.stringify([messages, queueCollapsed, editingQueueIndex]);
  if (signature === queueSignature) {
    panel.hidden = !messages.length;
    return;
  }
  queueSignature = signature;
  panel.replaceChildren();
  panel.hidden = !messages.length;
  panel.classList.toggle("collapsed", queueCollapsed);
  if (!messages.length) {
    editingQueueIndex = null;
    return;
  }

  const head = el("div", null, "queue-head");
  const toggle = el("button", null, "queue-toggle");
  toggle.type = "button";
  toggle.title = queueCollapsed ? "Развернуть очередь" : "Свернуть очередь";
  toggle.append(
    icon("chevron-down"),
    el("span", "Очередь"),
    el("span", String(messages.length), "pill-badge info"),
  );
  toggle.onclick = () => {
    queueCollapsed = !queueCollapsed;
    try {
      localStorage.setItem("pf-queue-collapsed", queueCollapsed ? "1" : "0");
    } catch {}
    queueSignature = "";
    renderQueue();
  };

  const actions = el("div", null, "queue-actions");
  const sendAll = iconAction("send", "Отправить всё сейчас", sendAllQueued);
  sendAll.disabled = !messages.length;
  const clear = iconAction("trash", "Очистить очередь", clearQueue, "queue-action danger");
  actions.append(sendAll, clear);
  head.append(toggle, actions);

  const body = el("div", null, "queue-body");
  body.hidden = queueCollapsed;
  const list = el("div", null, "queue-list");
  if (!queueCollapsed) {
    messages.forEach((text, index) => {
      if (editingQueueIndex === index) {
        const row = el("div", null, "queue-item editing");
        const box = el("div", null, "queue-edit");
        const textarea = el("textarea");
        textarea.value = queueEditDraft;
        textarea.rows = 2;
        textarea.setAttribute("aria-label", "Текст сообщения в очереди");
        textarea.oninput = () => {
          queueEditDraft = textarea.value;
        };
        const editActions = el("div", null, "queue-edit-actions");
        const save = iconAction("check", "Сохранить", () => saveQueueEdit(index, textarea.value), "queue-action");
        save.classList.add("ok");
        const cancel = iconAction("close", "Отмена", () => {
          editingQueueIndex = null;
          queueEditDraft = "";
          queueEditAttachments = [];
          queueSignature = "";
          renderQueue();
        });
        editActions.append(cancel, save);
        box.append(textarea, editActions);
        row.append(box);
        list.append(row);
        return;
      }
      const row = el("div", null, "queue-item");
      row.append(el("span", String(index + 1), "queue-index"));
      const parsed = splitAttachments(text);
      const copy = el("span", parsed.text || (parsed.attachments.length ? "Файл" : text), "queue-text");
      copy.title = parsed.text || text;
      if (parsed.attachments.length) {
        copy.append(el("span", ` · ${parsed.attachments.length} файл(а)`, "queue-files"));
      }
      row.append(copy);
      const itemActions = el("div", null, "queue-item-actions");
      itemActions.append(
        iconAction("send", "Отправить сейчас, прервав ответ", () => sendQueuedNow(index)),
        iconAction("edit", "Редактировать", () => {
          editingQueueIndex = index;
          queueEditDraft = parsed.text;
          queueEditAttachments = parsed.attachments;
          queueSignature = "";
          renderQueue();
        }),
        iconAction("close", "Удалить из очереди", () => unqueue(index)),
      );
      row.append(itemActions);
      list.append(row);
    });
  }
  body.append(list);
  panel.append(head, body);
}

function sendQueuedNow(index) {
  run("Отправляю сейчас…", async () => {
    const result = await api("send-now", { chat: state.active.id, index }, 120000);
    state.queue = result.queue || { steering: [], followUp: [] };
    editingQueueIndex = null;
    queueEditDraft = "";
    queueEditAttachments = [];
    queueSignature = "";
    renderQueue();
    showHint("Сообщение отправлено.");
  });
}

function sendAllQueued() {
  run("Отправляю очередь…", async () => {
    const result = await api("send-all", { chat: state.active.id }, 120000);
    state.queue = result.queue || { steering: [], followUp: [] };
    editingQueueIndex = null;
    queueEditDraft = "";
    queueEditAttachments = [];
    queueSignature = "";
    renderQueue();
    showHint("Очередь отправлена.");
  });
}

function saveQueueEdit(index, text) {
  const value = buildOutgoingText(text, queueEditAttachments);
  if (!value) {
    showHint("Введите текст сообщения или прикрепите файл.", true);
    return;
  }
  run("Сохраняю сообщение…", async () => {
    const result = await api("edit-queue", { chat: state.active.id, index, text: value }, 60000);
    state.queue = result.queue || { steering: [], followUp: [] };
    editingQueueIndex = null;
    queueEditDraft = "";
    queueEditAttachments = [];
    queueSignature = "";
    renderQueue();
    showHint("Сообщение в очереди обновлено.");
  });
}

function queueMessage(text) {
  const visible = String(text || "").trim();
  const items = [...attachments];
  const value = buildOutgoingText(visible, items);
  if (!value || !state.active) return;
  if (!canQueue()) return;
  const chat = state.active.id;
  const before = queueOf().followUp?.length || 0;
  state.queue = { ...queueOf(), followUp: [...(queueOf().followUp || []), value] };
  renderQueue();
  attachments = [];
  renderAttachments();
  $("draft").value = "";
  store(chat, "");
  autoGrow();
  renderStatus();
  beginTask("Ставлю в очередь…");
  api("prompt", { chat, text: value }, 60000)
    .then(() => {
      queueSignature = "";
      renderQueue();
      showHint("Сообщение добавлено в очередь.");
    })
    .catch((error) => {
      const followUp = [...(queueOf().followUp || [])];
      if (followUp.length > before) followUp.splice(before, 1);
      state.queue = { ...queueOf(), followUp };
      queueSignature = "";
      renderQueue();
      if (!$("draft").value) {
        $("draft").value = visible;
        store(chat, visible);
        autoGrow();
      }
      if (!attachments.length && items.length) {
        attachments = items;
        renderAttachments();
      }
      showHint(error.message, true);
    })
    .finally(() => {
      endTask();
      renderStatus();
    });
}

function canQueue() {
  if (!connected) {
    showHint("Нет соединения с pi.", true);
    return false;
  }
  if (state.ready === false) {
    showHint("Чат ещё подключается. Подождите секунду.", true);
    return false;
  }
  if (state.active?.readOnly) {
    showHint("Этот чат открыт в консоли. Создайте новый чат.", true);
    return false;
  }
  if (state.active?.host && state.busy) {
    showHint("В консоли уже идёт ответ. Дождитесь его завершения.", true);
    return false;
  }
  return true;
}

function unqueue(index) {
  run("Убираю из очереди…", async () => {
    const result = await api("unqueue", { chat: state.active.id, index }, 30000);
    state.queue = result.queue || { steering: [], followUp: [] };
    if (editingQueueIndex != null && editingQueueIndex >= index) {
      editingQueueIndex = null;
      queueEditDraft = "";
      queueEditAttachments = [];
    }
    queueSignature = "";
    renderQueue();
    if (result.removed) {
      const parsed = splitAttachments(result.removed);
      if (!$("draft").value) {
        $("draft").value = parsed.text;
        store(state.active.id, parsed.text);
        attachments = parsed.attachments;
        renderAttachments();
        autoGrow();
      }
    }
  });
}

function clearQueue() {
  run("Очищаю очередь…", async () => {
    const result = await api("clear-queue", { chat: state.active.id }, 30000);
    const returned = [...(result.steering || []), ...(result.followUp || [])];
    state.queue = { steering: [], followUp: [] };
    editingQueueIndex = null;
    queueEditDraft = "";
    queueEditAttachments = [];
    queueSignature = "";
    renderQueue();
    if (returned.length && !$("draft").value) {
      $("draft").value = returned.join("\n");
      store(state.active.id, $("draft").value);
      autoGrow();
      showHint("Очередь очищена, текст возвращён в поле ввода.");
    } else if (returned.length) {
      showHint("Очередь очищена. Текст не помещён в поле, потому что там уже есть черновик.");
    } else {
      showHint("Очередь пуста.");
    }
  });
}

/* ============================== send / edit / fork ============================== */

function sendMessage(text) {
  const visible = String(text || "").trim();
  const items = [...attachments];
  const value = buildOutgoingText(visible, items);
  if (!value || !state.active || !canQueue()) return;
  const chat = state.active.id;
  attachments = [];
  renderAttachments();
  $("draft").value = "";
  store(chat, "");
  autoGrow();
  renderStatus();
  beginTask("Отправляю сообщение…");
  api("prompt", { chat, text: value }, 60000)
    .then(() => {
      showError("");
      showHint("Отправлено.");
    })
    .catch((error) => {
      if (!$("draft").value) {
        $("draft").value = visible;
        store(chat, visible);
        autoGrow();
      }
      if (!attachments.length && items.length) {
        attachments = items;
        renderAttachments();
      }
      showHint(error.message, true);
    })
    .finally(() => {
      endTask();
      renderStatus();
    });
}

function abortGeneration() {
  if (!state.active) return;
  run("Останавливаю ответ…", async () => {
    const result = await api("abort", { chat: state.active.id }, 30000);
    const returned = [...(result.cleared?.steering || []), ...(result.cleared?.followUp || [])];
    state.queue = { steering: [], followUp: [] };
    editingQueueIndex = null;
    queueEditDraft = "";
    queueEditAttachments = [];
    queueSignature = "";
    renderQueue();
    if (returned.length && !$("draft").value) {
      $("draft").value = returned.join("\n");
      store(state.active.id, $("draft").value);
      autoGrow();
      showHint("Ответ остановлен. Очередь возвращена в поле ввода.");
    }
  });
}

function forkMessage(index, text) {
  if (!state.active) return;
  if (!canSwitch()) return;
  const chat = state.active.id;
  const label = text ? "Создаю чат и отправляю…" : "Создаю чат…";
  run(label, async () => {
    const next = await api("fork", { chat, index, text: text || "" }, 90000);
    applyState(next);
    page = "chat";
    editingIndex = null;
    renderedSignature = "";
    loadCatalog().catch(() => {});
    renderRoute();
    $("draft").focus();
    showHint(text ? "Новый чат создан, сообщение отправлено." : "Новый чат создан.");
  });
}

/* ============================== status ============================== */

function elapsedSeconds() {
  return Math.floor((clockBase + (state.busy ? Math.max(0, performance.now() - clockAt) : 0)) / 1000);
}
function progressTime() {
  const seconds = elapsedSeconds();
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderStatus() {
  const busy = Boolean(state.busy);
  const ready = state.ready !== false;
  const voice = state.voice;
  const recording = ["starting", "recording", "transcribing"].includes(voice?.phase);
  const navigating = Boolean(state.loading || pending || uploading);
  const readOnly = Boolean(state.active?.readOnly);
  $("exit").disabled = Boolean(busy || navigating || recording);
  $("draft").disabled = Boolean(readOnly || !connected);
  $("attach").hidden = !(page === "chat" && state.active && !readOnly);
  $("attach").disabled = !connected || readOnly;
  $("mic").disabled = !connected || !state.active || readOnly || voice?.phase === "transcribing";
  $("mic").replaceChildren(icon(voice?.phase === "recording" ? "stop" : "mic"));
  $("mic").setAttribute("aria-label", voice?.phase === "recording" ? "Закончить запись" : "Начать диктовку");

  const draftText = $("draft").value.trim();
  const queueButton = $("queue-send");
  if (queueButton) {
    queueButton.hidden = !(busy && (draftText || attachments.length) && !readOnly && connected && !state.active?.host);
    queueButton.disabled = !connected || (!draftText && !attachments.length) || !ready;
    queueButton.onclick = (event) => {
      event.preventDefault();
      queueMessage($("draft").value);
    };
  }
  const send = $("send");
  send.classList.toggle("stop", busy);
  send.replaceChildren(icon(busy ? "stop" : "arrow-up"));
  send.title = busy ? "Остановить ответ (Esc)" : "Отправить (Enter)";
  send.setAttribute("aria-label", busy ? "Остановить ответ" : "Отправить");
  send.disabled = !connected || navigating || recording || readOnly || !ready || (!busy && !draftText && !attachments.length);
  $("readonly").hidden = !readOnly;

  renderModelSelect(Boolean(busy || navigating || recording || state.loading || uploading || !ready));
  renderActivity(busy);
  renderQuestions();
  renderVoice(voice, recording);
  renderQuota();
  showError(state.error && !state.messages?.some((message) => message.error === state.error) ? state.error : "");
  $("notice").textContent = state.notice || "";
  $("notice").hidden = !state.notice;
  renderConnection();
}

function renderActivity(busy) {
  const activity = $("activity");
  const voice = state.voice;
  const recording = ["starting", "recording", "transcribing"].includes(voice?.phase);
  activity.classList.toggle("generating", busy);
  activity.classList.toggle("waiting", false);
  activity.replaceChildren();
  if (busy) {
    const current = state.messages?.findLast(
      (message) => message.role === "assistant" && message.status === "streaming",
    );
    const preview = state.routerProgress?.preview || current?.text || current?.thinking || "";
    const tail = Array.from(String(preview).replace(/\s+/g, " ").trim()).slice(-120).join("");
    const waiting = !tail;
    activity.classList.toggle("waiting", waiting);
    activity.append(
      el("span", progressTime(), "activity-time"),
      el("span", tail || "Подготавливаю ответ…", "activity-preview" + (waiting ? " waiting-label" : "")),
    );
    return;
  }
  if (state.active && state.ready === false) activity.textContent = "Подключаюсь к чату…";
  else if (uploading) activity.textContent = "Загружаю файлы в проект…";
  else if (recording) activity.textContent = voice.phase === "transcribing" ? "Распознаю запись…" : "Идёт запись…";
  else if (state.questions?.length) activity.textContent = "Нужен ваш ответ.";
}

function renderVoice(voice, recording) {
  $("voice-view").hidden = !recording;
  $("draft").style.visibility = recording ? "hidden" : "visible";
  if (recording) {
    const seconds = voice.seconds || 0;
    $("voice-label").textContent =
      voice.phase === "recording"
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · Enter — закончить`
        : voice.phase === "transcribing"
          ? `Распознаю · ${Math.round(voice.percent || 0)}%`
          : "Включаю микрофон…";
    drawWave(voice.levels || []);
  }
  const setup = $("voice-setup");
  setup.replaceChildren();
  if (voice && ["installing", "downloading", "loading", "error"].includes(voice.phase)) {
    setup.append(el("span", voice.phase === "error" ? "Голос не загрузился" : voice.label || "Подготовка голоса"));
    if (Number.isFinite(voice.percent)) {
      setup.append(el("span", ` · ${Math.round(voice.percent)}%`));
      const progress = el("progress");
      progress.max = 100;
      progress.value = voice.percent;
      setup.append(progress);
    }
  }
}

function renderQuota() {
  const available = state.routerProgress?.available ?? state.billing?.account?.available;
  $("quota").textContent = Number.isFinite(available)
    ? "Осталось " + Math.max(0, available).toLocaleString("ru-RU") + " токенов"
    : Object.values(state.statuses || {})
        .filter((value) => /осталось|quota|remaining/i.test(value))
        .join(" ");
}

async function renderQuestions() {
  const question = (state.questions || []).find((item) => !item.expires || item.expires > Date.now());
  if (question?.id === questionId) return;
  questionId = question?.id;
  $("question").replaceChildren();
  if (!question) return;
  const box = el("div", null, "question");
  box.append(el("h2", question.title || "Нужен ваш ответ"));
  if (question.message) box.append(el("p", question.message));
  const actions = el("div", null, "question-actions");
  const answer = (data) =>
    run("Отправляю ответ…", async () => {
      await api("answer", { chat: state.active?.id, id: question.id, ...data }, 30000);
      state.questions = (state.questions || []).filter((item) => item.id !== question.id);
      questionId = undefined;
      renderQuestions();
    });
  if (question.method === "select") {
    for (const option of question.options || []) {
      const button = el("button", option, "button");
      button.type = "button";
      button.onclick = () => answer({ value: option });
      actions.append(button);
    }
  } else if (question.method === "confirm") {
    const yes = el("button", "Да", "button primary");
    yes.type = "button";
    yes.onclick = () => answer({ confirmed: true });
    const no = el("button", "Нет", "button");
    no.type = "button";
    no.onclick = () => answer({ confirmed: false });
    actions.append(yes, no);
  } else {
    const input = el(question.method === "editor" ? "textarea" : "input");
    input.value = question.prefill || "";
    input.placeholder = question.placeholder || "";
    box.append(input);
    const submit = el("button", "Продолжить", "button primary");
    submit.type = "button";
    submit.onclick = () => answer({ value: input.value });
    actions.append(submit);
  }
  const cancel = el("button", "Отмена", "button ghost");
  cancel.type = "button";
  cancel.onclick = () => answer({ cancelled: true });
  actions.append(cancel);
  box.append(actions);
  $("question").append(box);
}

function drawWave(levels) {
  const canvas = $("wave");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  const ctx = canvas.getContext("2d");
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent-ink") || "#1e40af";
  const count = Math.floor(width / 4);
  const samples = levels.slice(-count);
  for (let index = 0; index < count; index += 1) {
    const value = samples[index - (count - samples.length)] || 0;
    const bar = Math.max(2, Math.pow(value, 0.7) * (height - 2));
    ctx.fillRect(index * 4, (height - bar) / 2, 1.5, bar);
  }
}

/* ============================== model menu ============================== */

function renderModelSelect(blocked = false) {
  const select = $("model-select");
  const current = state.active?.model;
  select.disabled = Boolean(blocked || !connected || !state.active || state.active.readOnly || state.ready === false);
  if (select.disabled && modelMenu.matches(":popover-open")) modelMenu.hidePopover();
  const name = current?.name || current?.id || "Модель";
  if (select.dataset.name !== name) {
    select.replaceChildren(el("span", name), icon("chevron-down"));
    select.dataset.name = name;
    select.title = "Выбрать модель · " + name;
    select.setAttribute("aria-label", select.title);
  }
  if (state.active && !modelsLoaded && !modelsLoading && Date.now() > modelRetryAfter) {
    loadModels();
  }
  renderModelMenu();
}

function loadModels() {
  if (modelsLoading || modelsLoaded) return;
  modelsLoading = true;
  modelsError = "";
  renderModelMenu();
  api("models", undefined, 20000)
    .then((result) => {
      modelList = result.models || [];
      modelsLoaded = true;
    })
    .catch((error) => {
      modelsError = error.message;
      modelRetryAfter = Date.now() + 15000;
    })
    .finally(() => {
      modelsLoading = false;
      renderModelMenu();
    });
}

function renderModelMenu() {
  const current = state.active?.model;
  const models = [...modelList];
  if (current && !models.some((model) => modelKey(model) === modelKey(current))) models.unshift(current);
  const signature = JSON.stringify([models, current, modelsLoading, modelsError]);
  if (modelMenu.dataset.signature === signature) return;
  modelMenu.dataset.signature = signature;
  modelMenu.replaceChildren();
  modelMenu.append(el("div", "Модель", "model-menu-title"));
  if (modelsLoading && !models.length) {
    const loading = el("div", null, "model-loading");
    for (let index = 0; index < 4; index += 1) {
      const line = el("span", null, "skeleton w-80");
      loading.append(line);
    }
    loading.append(el("div", "Загружаю модели…", "model-error"));
    modelMenu.append(loading);
    return;
  }
  if (modelsError && !models.length) {
    const error = el("div", null, "model-error");
    error.append(document.createTextNode(modelsError));
    const retry = el("button", "Повторить", "button");
    retry.type = "button";
    retry.onclick = () => {
      modelsLoaded = false;
      loadModels();
    };
    error.append(retry);
    modelMenu.append(error);
    return;
  }
  if (!models.length) {
    modelMenu.append(el("div", "Модели ещё не загружены.", "model-error"));
    return;
  }
  for (const model of models) {
    const chosen = current && modelKey(model) === modelKey(current);
    const option = el("button", null, "model-option");
    option.type = "button";
    option.setAttribute("aria-pressed", String(Boolean(chosen)));
    const copy = el("span");
    copy.append(el("span", model.name || model.id), el("small", model.provider || ""));
    option.append(copy, icon("check"));
    option.onclick = () => {
      modelMenu.hidePopover();
      if (chosen) return;
      run("Меняю модель…", async () => {
        await api("model", { chat: state.active.id, id: model.id, provider: model.provider }, 30000);
        state.active = { ...state.active, model };
        renderModelSelect();
      });
    };
    modelMenu.append(option);
  }
  if (modelsError) modelMenu.append(el("div", modelsError, "model-error"));
}

function modelKey(model) {
  return JSON.stringify([model?.provider, model?.id]);
}

function positionModels() {
  const rect = $("model-select").getBoundingClientRect();
  modelMenu.style.width = Math.min(320, innerWidth - 24) + "px";
  modelMenu.style.left = Math.max(12, Math.min(rect.left, innerWidth - 332)) + "px";
  modelMenu.style.top = "auto";
  modelMenu.style.bottom = Math.max(12, innerHeight - rect.top + 8) + "px";
  modelMenu.style.maxHeight = Math.max(120, rect.top - 24) + "px";
}

/* ============================== folder browser ============================== */

let browserPath = "";
let browserChosen = null;
let browserRequest = 0;

async function browseFolders(path) {
  const request = ++browserRequest;
  $("folder-choose").disabled = true;
  const status = $("browser-status");
  status.textContent = "Загружаю папки…";
  const list = $("browser-list");
  list.replaceChildren();
  const loading = el("div", null, "skeleton-list");
  for (let index = 0; index < 5; index += 1) {
    const row = el("div", null, "skeleton-row");
    row.append(el("span", null, "skeleton w-60"));
    loading.append(row);
  }
  list.append(loading);
  beginTask("Загружаю папки…");
  try {
    const data = await api("browse-folders" + (path ? "?path=" + encodeURIComponent(path) : ""), undefined, 30000);
    if (request !== browserRequest || !$("folder-dialog").open) return;
    browserPath = data.path;
    browserChosen = data.path;
    renderBrowser(data);
  } catch (error) {
    if (request === browserRequest && $("folder-dialog").open) status.textContent = error.message;
  } finally {
    endTask();
  }
}

function renderBrowser({ path, parent, entries, shortcuts = [] }) {
  $("folder-path").value = path;
  $("browser-status").textContent = entries.length
    ? "Откройте нужную папку и нажмите «Выбрать эту папку»."
    : "Вложенных папок нет. Можно выбрать эту папку.";
  const quick = $("browser-shortcuts");
  quick.replaceChildren();
  quick.hidden = !shortcuts.length;
  if (shortcuts.length) {
    const title = el("div", "Быстрый переход", "browser-section-title");
    const grid = el("div", null, "browser-shortcut-grid");
    for (const shortcut of shortcuts) {
      const card = el("button", null, "browser-shortcut");
      card.type = "button";
      const kind =
        shortcut.kind === "desktop"
          ? "desktop"
          : shortcut.kind === "downloads"
            ? "download"
            : shortcut.kind === "documents"
              ? "file"
              : shortcut.kind === "projects"
                ? "projects"
                : "home";
      card.append(
        icon(kind === "projects" ? "folder" : kind),
        el("span", shortcut.name, "shortcut-name"),
        el("span", shortcut.path, "shortcut-path"),
      );
      card.title = shortcut.path;
      card.onclick = () => browseFolders(shortcut.path);
      grid.append(card);
    }
    quick.append(title, grid);
  }
  const list = $("browser-list");
  list.replaceChildren();
  const up = el("button", null, "browser-row parent");
  up.type = "button";
  up.disabled = !parent;
  const upIcon = icon("arrow");
  upIcon.classList.add("up");
  up.append(upIcon, el("span", "На уровень выше", "browser-name"));
  up.onclick = () => browseFolders(parent);
  list.append(up);
  for (const entry of entries.filter((item) => !item.name.startsWith("."))) {
    const row = el("button", null, "browser-row");
    row.type = "button";
    row.append(icon("folder"), el("span", entry.name, "browser-name"));
    row.onclick = () => browseFolders(entry.path);
    list.append(row);
  }
  if (!entries.length) list.append(el("p", "В этой папке нет вложенных папок.", "browser-empty"));
  $("folder-choose").disabled = false;
}

function chooseFolder() {
  if (!browserChosen || $("folder-choose").disabled) return;
  const chosen = browserChosen;
  $("folder-dialog").close();
  run("Подключаю папку…", async () => {
    const result = await api("attach-project", { path: chosen }, 45000);
    if (result.cancelled) return;
    catalog = result.projects || [];
    projectId = result.project || null;
    page = "chats";
    searchOpen = false;
    searchValue = "";
    renderRoute();
    showHint("Папка подключена как проект.");
  });
}

/* ============================== uploads ============================== */

function uploadFiles() {
  return (async () => {
    const files = [...($("file-input").files || [])];
    $("file-input").value = "";
    if (!files.length) return;
    const project = state.active?.projectId;
    if (!project) {
      showHint("Сначала откройте чат в проекте.", true);
      return;
    }
    const payload = [];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        showHint(`«${file.name}» больше 50 МБ и был пропущен.`, true);
        continue;
      }
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let index = 0; index < buffer.length; index += 0x8000)
        binary += String.fromCharCode(...buffer.subarray(index, index + 0x8000));
      payload.push({ name: file.name, content: btoa(binary), truncated: false });
    }
    if (!payload.length) return;
    uploading = true;
    renderProgress();
    renderStatus();
    try {
      const result = await api("upload", { project, files: payload }, 120000);
      if (result.saved?.length)
        showHint(
          result.saved.length === 1
            ? `Файл «${result.saved[0]}» сохранён в проекте.`
            : `Сохранено файлов: ${result.saved.length}.`,
        );
    } catch (error) {
      showHint(error.message, true);
    } finally {
      uploading = false;
      renderProgress();
      renderStatus();
    }
  })();
}

/* ============================== apply server state ============================== */

function applyState(next) {
  const now = performance.now();
  const request = next.routerProgress?.requestId;
  if (
    next.busy &&
    (!state.busy || next.active?.id !== state.active?.id || (request && clockRequest && request !== clockRequest))
  ) {
    clockBase = 0;
    clockAt = now;
  }
  if (next.busy && Number.isFinite(next.routerProgress?.elapsedMs)) {
    clockBase = Math.max(next.routerProgress.elapsedMs, clockBase + Math.max(0, now - clockAt));
    clockAt = now;
  }
  if (request) clockRequest = request;
  if (!next.busy) clockRequest = undefined;
  billingUI.update(next.billing, next.busy);
  const previous = state.active?.id;
  const previousName = state.active?.id && state.active.id === next.active?.id ? state.active.name : null;
  state = next;
  if (previousName && state.active?.name && previousName !== state.active.name) {
    const project = projectOf(state.active.projectId);
    const chat = project?.chats.find((item) => item.id === state.active.id);
    if (chat) chat.name = state.active.name;
    renderBranches();
  }
  if (state.active?.id && state.messageVersions)
    versionManager.syncFromServer(state.messageVersions, state.active.id);
  if (previous !== state.active?.id) {
    store(previous, $("draft").value);
    $("draft").value = saved(state.active?.id);
    editingIndex = null;
    questionId = undefined;
    versionManager.reset();
    renderedSignature = "";
    queueSignature = "";
    attachments = [];
    renderAttachments();
    autoGrow();
  }
  if (state.dictation && state.dictation.id !== dictationId && saved("dictation-" + state.dictation.chat) !== state.dictation.id) {
    dictationId = state.dictation.id;
    store("dictation-" + state.dictation.chat, dictationId);
    const dictation = state.dictation;
    const old = dictation.chat === state.active?.id ? $("draft").value : saved(dictation.chat);
    const text = dictation.replace ? dictation.text : old + (old ? " " : "") + dictation.text;
    store(dictation.chat, text);
    if (dictation.chat === state.active?.id) $("draft").value = text;
  }
  if (state.active?.projectId) projectId = state.active.projectId;
  if (state.active && !lastChat) {
    lastChat = state.active.id;
    page = "chat";
    renderRoute();
    return;
  }
  if (!state.active && page === "chat") {
    page = "chats";
    renderRoute();
    return;
  }
  if (page === "chat") {
    renderBranches();
    renderChat();
    const project = projectOf(state.active?.projectId || projectId);
    setBreadcrumb(
      state.active?.name || "Чат",
      `${project?.name || state.active?.projectName || ""}${project?.folder ? " · " + project.folder : ""}`,
    );
  } else if (page === "projects" || page === "chats") {
    renderBranches();
  }
}

/* ============================== misc UI ============================== */

function autoGrow() {
  requestAnimationFrame(() => {
    const area = $("draft");
    if (!area) return;
    area.style.height = "auto";
    area.style.height = Math.min(area.scrollHeight, 250) + "px";
  });
}

setInterval(() => {
  if (!state.busy) return;
  const timer = document.querySelector(".activity-time");
  if (timer) timer.textContent = progressTime();
}, 300);

boot();
