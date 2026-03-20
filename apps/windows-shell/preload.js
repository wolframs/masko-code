const { contextBridge, ipcRenderer } = require("electron");

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch((error) => {
    ipcRenderer.send("masko:renderer-log", {
      level: "error",
      category: "ipc",
      message: `IPC invoke failed: ${channel}`,
      context: {
        error: String(error?.message ?? error)
      }
    });
    throw error;
  });
}

window.addEventListener("error", (event) => {
  ipcRenderer.send("masko:renderer-log", {
    level: "error",
    category: "renderer",
    message: event.message || "Unhandled renderer error",
    context: {
      fileName: event.filename ?? null,
      line: event.lineno ?? null,
      column: event.colno ?? null
    }
  });
});

window.addEventListener("unhandledrejection", (event) => {
  ipcRenderer.send("masko:renderer-log", {
    level: "error",
    category: "renderer",
    message: "Unhandled renderer promise rejection",
    context: {
      reason: String(event.reason?.message ?? event.reason)
    }
  });
});

contextBridge.exposeInMainWorld("masko", {
  getState: () => invoke("masko:get-state"),
  getSettings: () => invoke("masko:get-settings"),
  getMascotLibrary: () => invoke("masko:get-mascot-library"),
  getLogMetadata: () => invoke("masko:get-log-metadata"),
  updateSettings: (payload) => invoke("masko:update-settings", payload),
  approvalAction: (payload) => invoke("masko:approval-action", payload),
  activateEditor: (payload) => invoke("masko:activate-editor", payload),
  activateTerminal: (payload) => invoke("masko:activate-terminal", payload),
  detectClaudeRuntime: () => invoke("masko:detect-claude-runtime"),
  diagnoseHooks: () => invoke("masko:diagnose-hooks"),
  installHooks: () => invoke("masko:install-hooks"),
  repairHooks: () => invoke("masko:repair-hooks"),
  installMascot: (slug) => invoke("masko:install-mascot", slug),
  selectMascot: (id) => invoke("masko:select-mascot", id),
  openDiagnostics: () => invoke("masko:open-diagnostics"),
  openMascotManager: () => invoke("masko:open-mascot-manager"),
  openMascotPreview: () => invoke("masko:open-mascot-preview"),
  showOverlayContextMenu: () => invoke("masko:show-overlay-context-menu"),
  getOverlayBounds: () => invoke("masko:get-overlay-bounds"),
  setOverlayBounds: (payload) => ipcRenderer.send("masko:set-overlay-bounds", payload),
  windowAction: (action) => invoke("masko:window-action", action),
  log: (payload) => ipcRenderer.send("masko:renderer-log", payload),
  onHookInstallResult: (handler) => ipcRenderer.on("hook-install-result", (_event, value) => handler(value)),
  onState: (handler) => ipcRenderer.on("masko:state", (_event, value) => handler(value)),
  onMascotLibrary: (handler) => ipcRenderer.on("masko:mascot-library", (_event, value) => handler(value)),
  onSettings: (handler) => ipcRenderer.on("masko:settings", (_event, value) => handler(value))
});
