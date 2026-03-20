import { MascotStateMachine, mascotInputsFromState } from "./mascot-state-machine.js";

const approvalsRoot = document.getElementById("approvals");
const status = document.getElementById("status");
const collapsed = document.getElementById("collapsed");
const activeSessions = document.getElementById("activeSessions");
const recentEvents = document.getElementById("recentEvents");
const topEditor = document.getElementById("topEditor");
const openEditor = document.getElementById("openEditor");
const openTerminal = document.getElementById("openTerminal");
const openMascots = document.getElementById("openMascots");
const openPreview = document.getElementById("openPreview");
const mascotVideo = document.getElementById("mascotVideo");
const mascotFallback = document.getElementById("mascotFallback");
const mascotName = document.getElementById("mascotName");
const mascotState = document.getElementById("mascotState");
const mascotCaption = document.getElementById("mascotCaption");
const connectionHint = document.getElementById("connectionHint");
const connectClaude = document.getElementById("connectClaude");
const overlayRoot = document.querySelector(".overlay");
const mascotShell = document.querySelector(".mascot-shell");
const mascotBubble = document.getElementById("mascotBubble");

let latestState = null;
let latestSettings = null;
let mascotLibrary = null;
let mascot = null;
let lastMascotUrl = null;
let mascotVideoReady = false;
let latestClaudeRuntime = null;
let overlayDrag = null;
let pendingOverlayDragFrame = null;
let transientBubble = {
  text: "",
  visibleUntil: 0
};

function logUi(level, message, context = {}) {
  window.masko?.log?.({
    level,
    category: "overlay-ui",
    message,
    context
  });
}

function ensureMascotRuntime() {
  const currentMascot = mascotLibrary?.mascots?.find((item) => item.id === mascotLibrary.currentMascotId) ?? mascotLibrary?.mascots?.[0] ?? null;
  if (!currentMascot) {
    return null;
  }
  if (!mascot || mascot.config !== currentMascot.config) {
    mascot = new MascotStateMachine(currentMascot.config);
    lastMascotUrl = null;
  }
  return currentMascot;
}

function mascotCaptionForState(state, mascotSnapshot) {
  const visibleApprovals = state.approvals.filter((item) => !item.collapsed);
  if (visibleApprovals.length > 0) {
    const top = visibleApprovals[0];
    return `${top.event.toolName ?? "Claude"} needs your attention in ${top.event.cwd ?? "the current workspace"}.`;
  }

  const activeSession = state.sessions.find((session) => session.status === "active");
  if (!activeSession) {
    if ((latestClaudeRuntime?.claudeProcesses?.length ?? 0) > 0) {
      return "Claude Code is running, but this app has not received hook events from it yet.";
    }
    return "Waiting for Claude Code to connect.";
  }
  if (mascotSnapshot.nodeName === "Thinking") {
    return `Claude is compacting context in ${activeSession.projectName ?? activeSession.projectDir ?? "your workspace"}.`;
  }
  if (mascotSnapshot.nodeName === "Working") {
    return `Claude is working in ${activeSession.projectName ?? activeSession.projectDir ?? "your workspace"}.`;
  }
  return `Connected to ${activeSession.projectName ?? activeSession.projectDir ?? "your workspace"}.`;
}

function mascotBubbleText(state) {
  const visibleApprovals = state.approvals.filter((item) => !item.collapsed);
  if (visibleApprovals.length > 0) {
    if (visibleApprovals.length === 1) {
      const top = visibleApprovals[0];
      return top.event.toolName
        ? `${top.event.toolName} needs approval`
        : "Claude needs approval";
    }
    return `${visibleApprovals.length} approvals waiting`;
  }
  return transientBubble.visibleUntil > Date.now() ? transientBubble.text : "";
}

function updateTransientBubble(state) {
  const visibleApprovals = state.approvals.filter((item) => !item.collapsed);
  if (visibleApprovals.length > 0) {
    return;
  }

  const topNotification = state.notifications?.[0] ?? null;
  const createdAt = topNotification?.createdAt ? new Date(topNotification.createdAt).getTime() : null;
  if (
    topNotification
    && (topNotification.priority === "urgent" || topNotification.priority === "high")
    && Number.isFinite(createdAt)
    && Date.now() - createdAt <= 8000
  ) {
    transientBubble = {
      text: topNotification.title ?? "",
      visibleUntil: Date.now() + 5000
    };
    return;
  }

  if (transientBubble.visibleUntil <= Date.now()) {
    transientBubble = {
      text: "",
      visibleUntil: 0
    };
  }
}

function renderMascot(state) {
  const currentMascot = ensureMascotRuntime();
  if (!currentMascot || !mascot) {
    return;
  }
  const snapshot = mascot.applyInputs(mascotInputsFromState(state));
  mascotName.textContent = currentMascot.name;
  mascotState.textContent = snapshot.nodeName;
  mascotCaption.textContent = mascotCaptionForState(state, snapshot);

  if (snapshot.thumbnailUrl) {
    mascotFallback.src = snapshot.thumbnailUrl;
  }

  if (!snapshot.media?.url) {
    mascotVideoReady = false;
    mascotVideo.removeAttribute("src");
    mascotVideo.load();
    mascotFallback.style.display = "block";
    return;
  }

  if (snapshot.media.url !== lastMascotUrl) {
    lastMascotUrl = snapshot.media.url;
    mascotVideoReady = false;
    mascotVideo.loop = Boolean(snapshot.media.loop);
    mascotVideo.src = snapshot.media.url;
    mascotVideo.load();
    mascotVideo.play().catch(() => {
      mascotFallback.style.display = "block";
    });
  } else if (mascotVideo.loop !== Boolean(snapshot.media.loop)) {
    mascotVideo.loop = Boolean(snapshot.media.loop);
  }

  mascotFallback.style.display = mascotVideoReady ? "none" : "block";
}

async function loadSettings() {
  latestSettings = await window.masko.getSettings();
  topEditor.textContent = latestSettings.editorPreference === "cursor" ? "Cursor" : "VS Code";
  document.body.classList.toggle("shell-mode-mascot", latestSettings.appShellMode === "mascot");
}

async function loadClaudeRuntime() {
  latestClaudeRuntime = await window.masko.detectClaudeRuntime();
}

async function loadMascotLibrary() {
  mascotLibrary = await window.masko.getMascotLibrary();
  ensureMascotRuntime();
}

function pickShellPid() {
  return latestState?.approvals.find((item) => !item.collapsed)?.event?.shellPid
    ?? latestState?.sessions.find((session) => session.status === "active")?.shellPid
    ?? null;
}

function pickProjectDir() {
  return latestState?.approvals.find((item) => !item.collapsed)?.event?.cwd
    ?? latestState?.sessions.find((session) => session.status === "active")?.projectDir
    ?? null;
}

function questionList(approval) {
  const questions = approval.event.toolInput?.questions;
  return Array.isArray(questions) ? questions : [];
}

function suggestionList(approval) {
  return Array.isArray(approval.event.permissionSuggestions)
    ? approval.event.permissionSuggestions.filter((item) => item && typeof item === "object")
    : [];
}

function formatSuggestion(item) {
  if (item.type === "addRules" && Array.isArray(item.rules) && item.rules[0]) {
    return `${item.rules[0].toolName ?? "tool"}: ${item.rules[0].ruleContent ?? ""}`;
  }
  if (item.type === "setMode") {
    return `Mode: ${item.mode ?? "unknown"}`;
  }
  return JSON.stringify(item);
}

function renderApproval(approval) {
  const wrapper = document.createElement("article");
  wrapper.className = "approval";
  const preview = approval.event.toolInput?.command
    ?? approval.event.toolInput?.file_path
    ?? approval.event.message
    ?? "";
  const questions = questionList(approval);
  const suggestions = suggestionList(approval);
  const showsFeedback = approval.event.toolName === "ExitPlanMode" || Boolean(approval.event.toolInput?.prompt);

  wrapper.innerHTML = `
    <div class="approval-header">
      <div>
        <div><strong>${approval.event.toolName ?? "Permission request"}</strong></div>
        <div class="subtitle">${approval.event.cwd ?? "Unknown workspace"}</div>
      </div>
      <div class="pill">${approval.collapsed ? "Deferred" : "Waiting"}</div>
    </div>
    ${preview ? `<div class="subtitle" style="margin-top:8px">${preview}</div>` : ""}
    ${questions.length > 0 ? `<div class="subpanel" data-role="questions"></div>` : ""}
    ${showsFeedback ? `<div class="subpanel" data-role="feedback"><strong>Feedback</strong><textarea rows="4" placeholder="Tell Claude what to change or clarify"></textarea><button class="secondary send-feedback" style="margin-top:8px;">Send feedback</button></div>` : ""}
    ${suggestions.length > 0 ? `<div class="subpanel" data-role="suggestions"></div>` : ""}
    <div class="actions">
      <button class="allow">Approve</button>
      <button class="deny">Deny</button>
      <button class="defer">${approval.collapsed ? "Restore" : "Later"}</button>
    </div>
  `;

  wrapper.querySelector(".allow").addEventListener("click", async () => {
    await window.masko.approvalAction({ id: approval.id, action: "allow" });
    await refresh();
  });

  wrapper.querySelector(".deny").addEventListener("click", async () => {
    await window.masko.approvalAction({ id: approval.id, action: "deny" });
    await refresh();
  });

  wrapper.querySelector(".defer").addEventListener("click", async () => {
    await window.masko.approvalAction({ id: approval.id, action: approval.collapsed ? "restore" : "defer" });
    await refresh();
  });

  if (questions.length > 0) {
    const panel = wrapper.querySelector('[data-role="questions"]');
    panel.innerHTML = `<strong>Questions</strong>`;
    for (const question of questions) {
      const label = document.createElement("label");
      label.textContent = question.question ?? "Question";
      panel.append(label);
      let field;
      if (Array.isArray(question.options) && question.options.length > 0) {
        field = document.createElement("select");
        for (const option of question.options) {
          const item = document.createElement("option");
          item.value = option.label ?? "";
          item.textContent = option.label ?? option.description ?? "";
          field.append(item);
        }
      } else {
        field = document.createElement("input");
        field.type = "text";
        field.placeholder = question.header ?? "Your answer";
      }
      field.dataset.question = question.question ?? "";
      panel.append(field);
    }
    const submit = document.createElement("button");
    submit.className = "secondary";
    submit.style.marginTop = "8px";
    submit.textContent = "Send answers";
    submit.addEventListener("click", async () => {
      const answers = {};
      for (const element of panel.querySelectorAll("[data-question]")) {
        answers[element.dataset.question] = element.value;
      }
      await window.masko.approvalAction({
        id: approval.id,
        action: "allowWithAnswers",
        payload: { answers }
      });
      await refresh();
    });
    panel.append(submit);
  }

  if (showsFeedback) {
    wrapper.querySelector(".send-feedback")?.addEventListener("click", async () => {
      const feedback = wrapper.querySelector('[data-role="feedback"] textarea')?.value ?? "";
      await window.masko.approvalAction({
        id: approval.id,
        action: "allowWithFeedback",
        payload: { feedback }
      });
      await refresh();
    });
  }

  if (suggestions.length > 0) {
    const panel = wrapper.querySelector('[data-role="suggestions"]');
    panel.innerHTML = "<strong>Suggested permission updates</strong>";
    suggestions.forEach((suggestion, index) => {
      const row = document.createElement("label");
      row.className = "checkbox";
      row.innerHTML = `
        <input type="checkbox" data-suggestion-index="${index}" checked />
        <span>${formatSuggestion(suggestion)}</span>
      `;
      panel.append(row);
    });
    const apply = document.createElement("button");
    apply.className = "secondary";
    apply.style.marginTop = "8px";
    apply.textContent = "Approve with selected rules";
    apply.addEventListener("click", async () => {
      const updatedPermissions = suggestions.filter((_, index) => {
        return panel.querySelector(`[data-suggestion-index="${index}"]`)?.checked;
      });
      await window.masko.approvalAction({
        id: approval.id,
        action: "allowWithPermissions",
        payload: { updatedPermissions }
      });
      await refresh();
    });
    panel.append(apply);
  }

  return wrapper;
}

async function refresh() {
  latestState = await window.masko.getState();
  await loadSettings();
  await loadMascotLibrary();
  await loadClaudeRuntime();
  renderState(latestState);
}

function renderState(state) {
  latestState = state;
  updateTransientBubble(state);
  renderMascot(state);
  approvalsRoot.innerHTML = "";
  const visibleApprovals = state.approvals.filter((item) => !item.collapsed);
  const deferredApprovals = state.approvals.filter((item) => item.collapsed);
  const collapsedCount = state.approvals.length - visibleApprovals.length;

  status.textContent =
    visibleApprovals.length > 0
      ? `${visibleApprovals.length} approval request${visibleApprovals.length === 1 ? "" : "s"}`
      : state.sessions.some((session) => session.status === "active")
        ? "Claude Code connected"
        : (latestClaudeRuntime?.claudeProcesses?.length ?? 0) > 0
          ? `Detected ${latestClaudeRuntime.claudeProcesses.length} Claude process${latestClaudeRuntime.claudeProcesses.length === 1 ? "" : "es"}`
          : "Waiting for Claude Code hooks";
  collapsed.textContent = `${collapsedCount} deferred`;
  activeSessions.textContent = String(state.sessions.filter((session) => session.status === "active").length);
  recentEvents.textContent = String(state.events.length);
  connectionHint.textContent =
    !state.sessions.some((session) => session.status === "active") && (latestClaudeRuntime?.claudeProcesses?.length ?? 0) > 0
      ? latestClaudeRuntime.hookExists
        ? "Hooks exist, so restart the running Claude session to begin forwarding events."
        : "Claude is running, but hooks are not installed yet. Open diagnostics and install them."
      : "";
  const bubbleText = mascotBubbleText(state);
  mascotBubble.textContent = bubbleText;
  mascotBubble.classList.toggle("visible", Boolean(bubbleText) && mascotModeEnabled());

  for (const approval of visibleApprovals) {
    approvalsRoot.append(renderApproval(approval));
  }

  for (const approval of deferredApprovals) {
    approvalsRoot.append(renderApproval(approval));
  }
}

function mascotModeEnabled() {
  return latestSettings?.appShellMode === "mascot";
}

function flushOverlayDrag() {
  if (!overlayDrag?.latestBounds) {
    pendingOverlayDragFrame = null;
    return;
  }
  window.masko.setOverlayBounds(overlayDrag.latestBounds);
  pendingOverlayDragFrame = null;
}

function queueOverlayDrag(bounds) {
  if (!overlayDrag) {
    return;
  }
  overlayDrag.latestBounds = bounds;
  if (pendingOverlayDragFrame != null) {
    return;
  }
  pendingOverlayDragFrame = requestAnimationFrame(flushOverlayDrag);
}

async function beginMascotDrag(event) {
  if (event.button !== 0 || !mascotModeEnabled()) {
    return;
  }

  const bounds = await window.masko.getOverlayBounds();
  if (!bounds) {
    return;
  }

  overlayDrag = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    startBounds: bounds,
    latestBounds: bounds
  };
  document.body.classList.add("dragging");
  mascotShell.setPointerCapture(event.pointerId);
  logUi("info", "Mascot drag started", {
    x: bounds.x,
    y: bounds.y
  });
}

function updateMascotDrag(event) {
  if (!overlayDrag || event.pointerId !== overlayDrag.pointerId) {
    return;
  }

  const nextBounds = {
    ...overlayDrag.startBounds,
    x: Math.round(overlayDrag.startBounds.x + (event.screenX - overlayDrag.startScreenX)),
    y: Math.round(overlayDrag.startBounds.y + (event.screenY - overlayDrag.startScreenY))
  };
  queueOverlayDrag(nextBounds);
}

function endMascotDrag(event) {
  if (!overlayDrag || event.pointerId !== overlayDrag.pointerId) {
    return;
  }

  const finalBounds = overlayDrag.latestBounds ?? overlayDrag.startBounds;
  overlayDrag = null;
  document.body.classList.remove("dragging");
  if (pendingOverlayDragFrame != null) {
    cancelAnimationFrame(pendingOverlayDragFrame);
    pendingOverlayDragFrame = null;
  }
  window.masko.setOverlayBounds(finalBounds);
  logUi("info", "Mascot drag ended", {
    x: finalBounds.x,
    y: finalBounds.y
  });
}

mascotVideo.addEventListener("ended", () => {
  if (!mascot) {
    return;
  }
  const snapshot = mascot.handleVideoEnded();
  if (snapshot.media?.url && snapshot.media.url !== lastMascotUrl) {
    lastMascotUrl = null;
    renderMascot(latestState ?? { approvals: [], sessions: [] });
  }
});

mascotVideo.addEventListener("error", () => {
  mascotVideoReady = false;
  mascotFallback.style.display = "block";
});

mascotVideo.addEventListener("loadeddata", () => {
  mascotVideoReady = true;
  mascotFallback.style.display = "block";
});

mascotVideo.addEventListener("playing", () => {
  mascotVideoReady = true;
  mascotFallback.style.display = "none";
});

openEditor.addEventListener("click", async () => {
  logUi("info", "Open editor clicked", {
    editor: latestSettings?.editorPreference ?? null,
    shellPid: pickShellPid(),
    projectDir: pickProjectDir()
  });
  await loadSettings();
  await window.masko.activateEditor({
    editor: latestSettings.editorPreference,
    shellPid: pickShellPid(),
    projectDir: pickProjectDir()
  });
});

openTerminal.addEventListener("click", async () => {
  logUi("info", "Open terminal clicked", {
    projectDir: pickProjectDir()
  });
  await window.masko.activateTerminal({
    projectDir: pickProjectDir()
  });
});

openMascots.addEventListener("click", async () => {
  logUi("info", "Open mascots clicked");
  await window.masko.openMascotManager();
});

openPreview.addEventListener("click", async () => {
  logUi("info", "Open mascot preview clicked");
  await window.masko.openMascotPreview();
});

connectClaude.addEventListener("click", async () => {
  logUi("info", "Connect Claude clicked");
  await window.masko.openDiagnostics();
});

overlayRoot.addEventListener("contextmenu", async (event) => {
  event.preventDefault();
  logUi("info", "Overlay context menu requested", {
    mode: latestSettings?.appShellMode ?? null
  });
  await window.masko.showOverlayContextMenu();
});

mascotShell.addEventListener("pointerdown", (event) => {
  beginMascotDrag(event).catch((error) => {
    logUi("warn", "Mascot drag could not start", {
      error: String(error?.message ?? error)
    });
  });
});
mascotShell.addEventListener("pointermove", updateMascotDrag);
mascotShell.addEventListener("pointerup", endMascotDrag);
mascotShell.addEventListener("pointercancel", endMascotDrag);

window.masko.onState(async (state) => {
  await loadSettings();
  if (!mascotLibrary) {
    await loadMascotLibrary();
  }
  await loadClaudeRuntime();
  renderState(state);
});

window.masko.onMascotLibrary(async (value) => {
  mascotLibrary = value;
  ensureMascotRuntime();
  if (latestState) {
    renderState(latestState);
  }
});

window.masko.onSettings((value) => {
  latestSettings = value;
  document.body.classList.toggle("shell-mode-mascot", latestSettings.appShellMode === "mascot");
  if (latestState) {
    renderState(latestState);
  }
});

refresh().catch((error) => {
  logUi("error", "Initial overlay refresh failed", {
    error: String(error?.message ?? error)
  });
});
setInterval(() => {
  loadClaudeRuntime().then(() => {
    if (latestState) {
      renderState(latestState);
    }
  }).catch((error) => {
    logUi("warn", "Periodic Claude runtime refresh failed", {
      error: String(error?.message ?? error)
    });
  });
}, 5000);

setInterval(() => {
  if (latestState && transientBubble.visibleUntil > 0) {
    renderState(latestState);
  }
}, 500);
