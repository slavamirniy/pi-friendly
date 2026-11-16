// Contextual instructions use real input, recording and request state.
export const voiceIsAvailable = (phase) => ["ready", "starting", "recording", "transcribing"].includes(phase);

export function createOnboarding({ document, window, icon, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const hints = new Map();
  const chats = new Map();
  let context = {};
  let project = null;
  let positionFrame;
  const $ = (id) => document.getElementById(context.elements?.[id] || id);

  function hint(id, target, text, side = "right", symbol) {
    let item = hints.get(id);
    if (!item) {
      const node = document.createElement("aside");
      node.className = "coachmark";
      node.setAttribute("role", "note");
      const copy = document.createElement("span");
      copy.className = "coachmark-copy";
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrow.setAttribute("viewBox", "0 0 32 32");
      arrow.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(arrow.namespaceURI, "path");
      path.setAttribute("d", "M29 16H4m7-7-7 7 7 7");
      arrow.append(path);
      node.append(arrow, copy);
      document.body.append(node);
      item = { node, copy, target, side, key: "" };
      hints.set(id, item);
    }
    item.target = target;
    item.side = side;
    const key = text + "|" + (symbol || "");
    if (item.key !== key) {
      item.key = key;
      item.copy.replaceChildren();
      if (symbol) {
        const keycap = document.createElement("span");
        keycap.className = "coachmark-symbol";
        keycap.append(icon(symbol));
        item.copy.append(keycap);
      }
      item.copy.append(document.createTextNode(text));
    }
    item.node.classList.add("is-visible");
    item.node.setAttribute("aria-hidden", "false");
    positionSoon();
  }

  function hide(id) {
    const item = hints.get(id);
    if (!item) return;
    item.node.classList.remove("is-visible");
    item.node.setAttribute("aria-hidden", "true");
  }

  function positionSoon() {
    if (positionFrame) return;
    positionFrame = window.requestAnimationFrame(() => {
      positionFrame = null;
      for (const item of hints.values()) {
        if (!item.node.classList.contains("is-visible")) continue;
        if (!item.target?.isConnected) { item.node.classList.remove("is-visible"); continue; }
        const r = item.target.getBoundingClientRect();
        const node = item.node;
        const gap = 42;
        let side = item.side;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        if (side === "right" && r.right + gap + width > window.innerWidth - 16) side = "above";
        let left = r.right + gap, top = r.top + r.height / 2 - height / 2;
        if (side === "above") {
          left = r.left;
          top = r.top - height - gap;
        } else if (side === "voice") {
          const composer = $("composer").getBoundingClientRect();
          left = r.right - width;
          const draftVisible = hints.get("draft")?.node.classList.contains("is-visible");
          top = composer.top - height - gap - (draftVisible && composer.width < 540 ? 70 : 0);
        } else if (side === "below") {
          left = r.right - width;
          top = r.bottom + gap;
        }
        left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
        top = Math.max(16, Math.min(top, window.innerHeight - height - 12));
        node.dataset.side = side;
        node.style.left = `${left}px`;
        node.style.top = `${top}px`;
        node.style.setProperty("--coach-anchor", `${Math.max(16, Math.min(width - 16, r.left + r.width / 2 - left))}px`);
        const arrow = node.firstChild;
        const path = arrow.firstChild;
        if (side === "above" || side === "voice") {
          const length = Math.max(24, r.top - top - height - 18);
          arrow.setAttribute("viewBox", `0 0 32 ${length}`);
          arrow.style.height = `${length}px`;
          path.setAttribute("d", `M16 2V${length - 3}m-6-6 6 6 6-6`);
        } else {
          arrow.setAttribute("viewBox", "0 0 32 32");
          arrow.style.height = "32px";
          path.setAttribute("d", side === "below" ? "M16 30V3m-6 6 6-6 6 6" : "M29 16H4m7-7-7 7 7 7");
        }
      }
    });
  }

  function projectHint() {
    if (context.page !== "create" || !project?.input.isConnected) { hide("project"); return; }
    if (project.loading) {
      hint("project", project.submit, "Подождите, пока проект создаётся");
    } else if (project.ready && project.input.value.trim()) {
      hint("project", project.submit, "Создайте проект");
    } else {
      hint("project", project.input, "Введи название проекта");
    }
  }

  function chat() {
    if (!context.chatId) return null;
    if (!chats.has(context.chatId)) chats.set(context.chatId, { timer: null, ready: false, submitted: false });
    return chats.get(context.chatId);
  }

  function refreshChat() {
    const current = chat();
    const active = context.page === "chat" && current && !current.submitted && !context.hasMessages &&
      !context.busy && !context.loading && !context.readOnly && context.connected && !context.imageOpen;
    const text = $("draft")?.value.trim();
    const phase = context.voicePhase;
    const voiceBusy = ["starting", "recording", "transcribing"].includes(phase) && context.voiceTarget !== "panel";
    const send = Boolean(active && current.ready && text && !voiceBusy && !$("send").disabled);
    const wrap = $("composer")?.closest(".composer-wrap") || $("composer");
    wrap?.classList.toggle("has-send-coachmark", send);
    if (!active) {
      hide("draft"); hide("voice"); hide("send");
      return;
    }
    if (!text && !voiceBusy) hint("draft", $("draft"), "Здесь опиши задачу", context.wizard ? "right" : "above");
    else hide("draft");
    if (voiceIsAvailable(phase) && !send && context.voiceTarget !== "panel") {
      if (phase === "recording") hint("voice", $("mic"), "Нажми эту кнопку, чтобы закончить говорить", context.wizard ? "right" : "voice", "stop");
      else if (phase === "ready") hint("voice", $("mic"), "Нажми микрофон, чтобы надиктовать задачу", context.wizard ? "right" : "voice", "mic");
      else hide("voice");
    } else hide("voice");
    if (send) hint("send", $("send"), "Нажми «Отправить», чтобы начать создавать", "below");
    else hide("send");
  }

  function update(next) {
    if (next.page !== "create" && project) {
      clearTimer(project.timer);
      project = null;
    }
    context = next;
    projectHint();
    refreshChat();
    positionSoon();
  }

  function bindProject(input, submit) {
    if (project) clearTimer(project.timer);
    project = { input, submit, ready: false, loading: false, timer: null };
    input.addEventListener("input", () => {
      if (project?.input !== input) return;
      if (!input.value.trim()) {
        clearTimer(project.timer); project.timer = null; project.ready = false;
      } else if (!project.timer && !project.ready) {
        project.timer = setTimer(() => {
          if (project?.input !== input) return;
          project.ready = true; project.timer = null; projectHint();
        }, 2000);
      }
      projectHint();
    });
    projectHint();
  }

  function projectLoading(value) {
    if (!project) return;
    project.loading = value;
    if (value) { clearTimer(project.timer); project.timer = null; }
    projectHint();
  }

  function typed() {
    const current = chat();
    if (!current) return;
    if (!$("draft").value.trim()) {
      clearTimer(current.timer); current.timer = null; current.ready = false;
    } else if (!current.timer && !current.ready) {
      // Start once on the first character, not again on every keystroke.
      current.timer = setTimer(() => { current.ready = true; current.timer = null; refreshChat(); }, 5000);
    }
    refreshChat();
  }

  function dictated() {
    const current = chat();
    if (!current) return;
    clearTimer(current.timer); current.timer = null; current.ready = true;
    refreshChat();
  }

  function submitted(value = true) {
    const current = chat();
    if (!current) return;
    clearTimer(current.timer); current.timer = null; current.submitted = value;
    refreshChat();
  }

  window.addEventListener("resize", positionSoon);
  document.addEventListener("scroll", positionSoon, true);
  return { update, bindProject, projectLoading, typed, dictated, submitted };
}
