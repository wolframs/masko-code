import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, screen, globalShortcut, Notification } from "electron";
import {
  FileSettingsStore,
  FileJsonStateStore,
  HookServer,
  MaskoCoreController
} from "../../packages/core/src/index.js";
import {
  ElectronActivationService,
  ElectronHookInstallationService,
  ElectronNotificationService,
  ElectronOverlayService
} from "./services/platform-services.js";
import { deriveOverlayPlacement, clampBoundsToWorkArea } from "./services/display-placement.js";
import { MascotLibrary } from "./services/mascot-library.js";
import { findMaskoProtocolArg, parseMaskoProtocolUrl } from "./services/masko-protocol.js";
import { detectRuntimeMode } from "./services/runtime-mode.js";
import { RuntimeLogger } from "./services/runtime-logger.js";
import { normalizeShellMode, overlayWindowSizeForMode } from "./services/overlay-shell-mode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;
let overlayWindow = null;
let diagnosticsWindow = null;
let mascotWindow = null;
let mascotPreviewWindow = null;
let hookServer = null;
let controller = null;
let settingsStore = null;
let runtimePaths = null;
let logger = null;
let mascotLibrary = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function currentSettings() {
  const settings = settingsStore?.load?.() ?? {};
  return {
    ...settings,
    appShellMode: normalizeShellMode(runtimePaths?.appModeOverride ?? settings.appShellMode)
  };
}

function updatePersistedPort(port) {
  const current = settingsStore.load();
  if (current.port === port) {
    return current;
  }

  const merged = {
    ...current,
    port
  };
  settingsStore.save(merged);
  return merged;
}

async function startHookServerWithFallback(requestedPort) {
  const preferredPort = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 49152;
  const attempts = [preferredPort, 0];
  let lastError = null;

  for (const port of attempts) {
    const candidate = new HookServer({
      controller,
      port
    });

    try {
      await candidate.start();
      hookServer = candidate;
      updatePersistedPort(candidate.port);
      logger?.info("hook-server", "Hook server listening", {
        requestedPort: preferredPort,
        activePort: candidate.port,
        fallbackUsed: candidate.port !== preferredPort
      });
      return candidate;
    } catch (error) {
      lastError = error;
      logger?.warn("hook-server", "Hook server listen failed", {
        requestedPort: port,
        code: error.code ?? null,
        error: String(error.message ?? error)
      });
      await candidate.stop().catch(() => {});

      if (!["EADDRINUSE", "EACCES"].includes(error.code) || port === 0) {
        throw error;
      }
    }
  }

  throw lastError;
}

process.on("uncaughtException", (error) => {
  console.error("[masko-win64] uncaughtException", error);
  logger?.error("process", "uncaughtException", {
    error: String(error?.stack ?? error?.message ?? error)
  });
  app.isQuiting = true;
  try {
    hookServer?.stop?.();
  } catch {}
  app.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error("[masko-win64] unhandledRejection", error);
  logger?.error("process", "unhandledRejection", {
    error: String(error?.stack ?? error?.message ?? error)
  });
  app.isQuiting = true;
  try {
    hookServer?.stop?.();
  } catch {}
  app.exit(1);
});

function ensureWindows() {
  app.setAppUserModelId("ai.masko.code.win64");
}

function runtimeMode() {
  return detectRuntimeMode({ app, processLike: process });
}

function resolveRuntimePaths() {
  const home = process.env.MASKO_HOME_OVERRIDE || app.getPath("home");
  const appData = process.env.MASKO_APPDATA_OVERRIDE || app.getPath("appData");
  const portOverride = Number.parseInt(process.env.MASKO_PORT_OVERRIDE ?? "", 10);
  const appModeOverride = process.env.MASKO_APP_MODE_OVERRIDE || null;
  return {
    home,
    appData,
    portOverride: Number.isFinite(portOverride) ? portOverride : null,
    appModeOverride: appModeOverride ? normalizeShellMode(appModeOverride) : null
  };
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <rect width="32" height="32" rx="8" fill="#171b21"/>
      <circle cx="16" cy="16" r="10" fill="#f95d02"/>
      <circle cx="13" cy="14" r="2" fill="#fff"/>
      <circle cx="19" cy="14" r="2" fill="#fff"/>
      <path d="M11 20c2.4 2.2 7.6 2.2 10 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>
  `;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function createWindows() {
  overlayWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: "Masko Overlay",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  diagnosticsWindow = new BrowserWindow({
    width: 980,
    height: 720,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#12161d",
    title: "Masko Diagnostics",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mascotWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#f6f1e8",
    title: "Masko Mascots",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mascotPreviewWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#120d1e",
    title: "Masko Preview",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  overlayWindow.loadFile(path.join(__dirname, "renderer", "overlay.html"));
  diagnosticsWindow.loadFile(path.join(__dirname, "renderer", "diagnostics.html"));
  mascotWindow.loadFile(path.join(__dirname, "renderer", "mascots.html"));
  mascotPreviewWindow.loadFile(path.join(__dirname, "renderer", "mascot-preview.html"));
  wireWindowLogging(overlayWindow, "overlay");
  wireWindowLogging(diagnosticsWindow, "diagnostics");
  wireWindowLogging(mascotWindow, "mascots");
  wireWindowLogging(mascotPreviewWindow, "mascot-preview");
  positionOverlayWindow();

  overlayWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      saveSettingsPatch({ overlayVisible: false });
      overlayWindow.hide();
    }
  });

  overlayWindow.on("move", persistOverlayPlacement);
  overlayWindow.on("resize", persistOverlayPlacement);

  diagnosticsWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      diagnosticsWindow.hide();
    }
  });

  mascotWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mascotWindow.hide();
    }
  });

  mascotPreviewWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mascotPreviewWindow.hide();
    }
  });
}

function positionOverlayWindow() {
  if (!overlayWindow) {
    return;
  }
  const settings = currentSettings();
  const modeSize = overlayWindowSizeForMode(settings.appShellMode);
  const displays = screen.getAllDisplays();
  const placement = deriveOverlayPlacement({
    displays,
    mode: settings.overlayDisplayMode ?? "remember",
    lastDisplayId: settings.overlayDisplayId ?? null,
    savedBounds: settings.overlayBounds ?? null,
    cursorPoint: screen.getCursorScreenPoint(),
    primaryDisplayId: screen.getPrimaryDisplay()?.id ?? null,
    width: modeSize.width,
    height: modeSize.height
  });
  overlayWindow.setBounds(placement.bounds);
  saveSettingsPatch({
    overlayDisplayId: placement.display?.id ?? settings.overlayDisplayId ?? null,
    overlayBounds: placement.bounds
  });
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Masko Code");
  tray.on("click", () => {
    overlayWindow.isVisible() ? hideOverlayWindow() : showOverlay();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Overlay",
        click: () => {
          positionOverlayWindow();
          showOverlay();
        }
      },
      {
        label: "Open Diagnostics",
        click: () => showDiagnostics()
      },
      {
        label: "Switch to Floating Mascot Mode",
        click: () => setAppShellMode("mascot")
      },
      {
        label: "Switch to Developer Overlay",
        click: () => setAppShellMode("developer")
      },
      {
        label: "Open Mascots",
        click: () => showMascotManager()
      },
      {
        label: "Preview Mascot",
        click: () => showMascotPreview()
      },
      {
        label: "Install Claude Hooks",
        click: async () => {
          const result = await controller.hookInstaller.install();
          diagnosticsWindow.webContents.send("hook-install-result", result);
        }
      },
      {
        label: "Repair Claude Hooks",
        click: async () => {
          const result = await controller.hookInstaller.repair();
          diagnosticsWindow.webContents.send("hook-install-result", result);
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => {
          app.isQuiting = true;
          app.quit();
        }
      }
    ])
  );
}

function showOverlay() {
  logger?.info("window", "Showing overlay window");
  positionOverlayWindow();
  overlayWindow.show();
  overlayWindow.focus();
  saveSettingsPatch({ overlayVisible: true });
}

function hideOverlayWindow() {
  overlayWindow.hide();
  saveSettingsPatch({ overlayVisible: false });
}

function showDiagnostics() {
  showUtilityWindow(diagnosticsWindow);
}

function showMascotManager() {
  showUtilityWindow(mascotWindow);
}

function showMascotPreview() {
  showUtilityWindow(mascotPreviewWindow);
}

function showUtilityWindow(window) {
  if (!window) {
    return;
  }
  logger?.info("window", "Showing utility window", {
    title: window.getTitle()
  });
  if (window.isMinimized()) {
    window.restore();
  }
  window.setAlwaysOnTop(true, "floating");
  window.show();
  window.focus();
  window.moveTop();
  setTimeout(() => {
    if (!window.isDestroyed()) {
      window.setAlwaysOnTop(false);
    }
  }, 250);
}

function setAppShellMode(mode) {
  const nextMode = normalizeShellMode(mode);
  const settings = settingsStore.load();
  saveSettingsPatch({ appShellMode: nextMode });
  logger?.info("window", "Updated app shell mode", {
    previousMode: settings.appShellMode ?? "developer",
    nextMode
  });
  positionOverlayWindow();
  showOverlay();
  broadcastSettings();
}

function showOverlayContextMenu() {
  const settings = currentSettings();
  Menu.buildFromTemplate([
    {
      label: "Open Diagnostics",
      click: () => showDiagnostics()
    },
    {
      label: "Open Mascots",
      click: () => showMascotManager()
    },
    {
      label: "Preview Mascot",
      click: () => showMascotPreview()
    },
    {
      type: "separator"
    },
    {
      label: settings.appShellMode === "mascot" ? "Switch to Developer Overlay" : "Switch to Floating Mascot Mode",
      click: () => setAppShellMode(settings.appShellMode === "mascot" ? "developer" : "mascot")
    },
    {
      label: "Quit",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]).popup({
    window: overlayWindow
  });
}

function wireWindowLogging(window, name) {
  if (!window) {
    return;
  }

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logger?.info("renderer-console", `${name}: ${message}`, {
      level,
      line,
      sourceId
    });
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    logger?.error("renderer", `${name} render process gone`, details);
  });
  window.webContents.on("unresponsive", () => {
    logger?.warn("renderer", `${name} became unresponsive`);
  });
  window.webContents.on("responsive", () => {
    logger?.info("renderer", `${name} became responsive again`);
  });
}

function broadcastMascotLibrary() {
  const payload = mascotLibrary?.list?.() ?? null;
  overlayWindow?.webContents.send("masko:mascot-library", payload);
  diagnosticsWindow?.webContents.send("masko:mascot-library", payload);
  mascotWindow?.webContents.send("masko:mascot-library", payload);
  mascotPreviewWindow?.webContents.send("masko:mascot-library", payload);
}

function broadcastSettings() {
  const payload = currentSettings();
  overlayWindow?.webContents.send("masko:settings", payload);
  diagnosticsWindow?.webContents.send("masko:settings", payload);
  mascotWindow?.webContents.send("masko:settings", payload);
  mascotPreviewWindow?.webContents.send("masko:settings", payload);
}

async function handleMaskoProtocol(rawUrl) {
  const parsed = parseMaskoProtocolUrl(rawUrl);
  if (!parsed) {
    return;
  }
  if (parsed.action === "install") {
    const result = await mascotLibrary.installFromSlug(parsed.slug);
    broadcastMascotLibrary();
    showMascotManager();
    logger?.info("mascot", "Handled masko protocol install", {
      slug: parsed.slug,
      ok: result.ok
    });
  }
}

function registerMaskoProtocolClient() {
  const smokeTestMs = Number.parseInt(process.env.MASKO_SMOKE_TEST_MS ?? "", 10);
  if (Number.isFinite(smokeTestMs) && smokeTestMs > 0) {
    return;
  }
  if (runtimeMode().isDefaultApp) {
    app.setAsDefaultProtocolClient("masko", process.execPath, [path.resolve(process.argv[1])]);
    return;
  }
  app.setAsDefaultProtocolClient("masko");
}

function saveSettingsPatch(patch) {
  if (!settingsStore) {
    return;
  }
  const current = settingsStore.load();
  settingsStore.save({
    ...current,
    ...patch,
    notifications: {
      ...(current.notifications ?? {}),
      ...(patch.notifications ?? {})
    },
    hotkeys: {
      ...(current.hotkeys ?? {}),
      ...(patch.hotkeys ?? {})
    }
  });
}

function persistOverlayPlacement() {
  if (!overlayWindow || !settingsStore) {
    return;
  }
  const bounds = overlayWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display?.workArea ?? screen.getPrimaryDisplay().workArea;
  const clamped = clampBoundsToWorkArea(bounds, workArea, 24);
  saveSettingsPatch({
    overlayBounds: clamped,
    overlayDisplayId: display?.id ?? null
  });
}

function topPendingApproval() {
  const approvals = controller?.snapshot?.().approvals ?? [];
  return approvals.find((item) => !item.collapsed) ?? approvals[0] ?? null;
}

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  const settings = settingsStore.load();
  const hotkeys = settings.hotkeys ?? {};

  const bindings = [
    {
      accelerator: hotkeys.toggleOverlay,
      action: () => {
        overlayWindow.isVisible() ? overlayWindow.hide() : showOverlay();
        logger?.info("hotkey", "Overlay hotkey triggered", { accelerator: hotkeys.toggleOverlay });
      }
    },
    {
      accelerator: hotkeys.openDiagnostics,
      action: () => {
        showDiagnostics();
        logger?.info("hotkey", "Diagnostics hotkey triggered", { accelerator: hotkeys.openDiagnostics });
      }
    },
    {
      accelerator: hotkeys.approveTop,
      action: () => {
        const approval = topPendingApproval();
        if (approval) {
          controller.resolveApproval(approval.id, "allow");
        }
        logger?.info("hotkey", "Approve hotkey triggered", { accelerator: hotkeys.approveTop, approvalId: approval?.id ?? null });
      }
    },
    {
      accelerator: hotkeys.denyTop,
      action: () => {
        const approval = topPendingApproval();
        if (approval) {
          controller.resolveApproval(approval.id, "deny");
        }
        logger?.info("hotkey", "Deny hotkey triggered", { accelerator: hotkeys.denyTop, approvalId: approval?.id ?? null });
      }
    },
    {
      accelerator: hotkeys.deferTop,
      action: () => {
        const approval = topPendingApproval();
        if (approval) {
          controller.resolveApproval(approval.id, "defer");
        }
        logger?.info("hotkey", "Defer hotkey triggered", { accelerator: hotkeys.deferTop, approvalId: approval?.id ?? null });
      }
    }
  ];

  for (const binding of bindings) {
    if (!binding.accelerator) {
      continue;
    }
    const ok = globalShortcut.register(binding.accelerator, binding.action);
    logger?.info("hotkey", ok ? "Registered hotkey" : "Failed to register hotkey", {
      accelerator: binding.accelerator
    });
  }
}

function applyStartupSettings() {
  const settings = settingsStore.load();
  app.setLoginItemSettings({
    openAtLogin: Boolean(settings.openAtLogin)
  });
  logger?.info("startup", "Updated startup-at-login setting", {
    openAtLogin: Boolean(settings.openAtLogin)
  });
}

function wireDisplayObservers() {
  const reposition = () => {
    if (!overlayWindow) {
      return;
    }
    positionOverlayWindow();
    if (overlayWindow.isVisible()) {
      overlayWindow.showInactive();
    }
  };

  screen.on("display-added", reposition);
  screen.on("display-removed", reposition);
  screen.on("display-metrics-changed", reposition);
}

function wireIpc() {
  ipcMain.handle("masko:get-state", () => controller.snapshot());
  ipcMain.handle("masko:get-settings", () => currentSettings());
  ipcMain.handle("masko:get-overlay-bounds", () => overlayWindow?.getBounds?.() ?? null);
  ipcMain.handle("masko:show-overlay-context-menu", () => {
    showOverlayContextMenu();
    return true;
  });
  ipcMain.handle("masko:get-mascot-library", () => mascotLibrary.list());
  ipcMain.handle("masko:get-log-metadata", () => ({
    filePath: logger?.filePath ?? null
  }));
  ipcMain.handle("masko:window-action", (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }
    switch (action) {
      case "minimize":
        window.minimize();
        return true;
      case "toggle-maximize":
        window.isMaximized() ? window.unmaximize() : window.maximize();
        return true;
      case "close":
        window.close();
        return true;
      default:
        return false;
    }
  });
  ipcMain.handle("masko:select-mascot", async (_event, id) => {
    const result = mascotLibrary.select(id);
    broadcastMascotLibrary();
    return result;
  });
  ipcMain.handle("masko:install-mascot", async (_event, slug) => {
    const result = await mascotLibrary.installFromSlug(slug);
    broadcastMascotLibrary();
    return result;
  });
  ipcMain.handle("masko:open-diagnostics", () => {
    showDiagnostics();
    return true;
  });
  ipcMain.handle("masko:open-mascot-manager", () => {
    showMascotManager();
    return true;
  });
  ipcMain.handle("masko:open-mascot-preview", () => {
    showMascotPreview();
    return true;
  });
  ipcMain.handle("masko:update-settings", async (_event, nextSettings) => {
    const current = settingsStore.load();
    const merged = {
      ...current,
      ...nextSettings,
      appShellMode: normalizeShellMode(nextSettings.appShellMode ?? current.appShellMode),
      notifications: {
        ...(current.notifications ?? {}),
        ...(nextSettings.notifications ?? {})
      },
      hotkeys: {
        ...(current.hotkeys ?? {}),
        ...(nextSettings.hotkeys ?? {})
      }
    };
    settingsStore.save(merged);
    if (nextSettings.port && nextSettings.port !== current.port) {
      await hookServer.stop();
      await startHookServerWithFallback(merged.port);
      await controller.hookInstaller.repair();
    }
    applyStartupSettings();
    registerGlobalShortcuts();
    if (
      nextSettings.appShellMode ||
      nextSettings.overlayDisplayMode ||
      nextSettings.overlayBounds ||
      nextSettings.showOverlayOnStartup != null
    ) {
      positionOverlayWindow();
    }
    broadcastSettings();
    controller.persistState();
    return merged;
  });
  ipcMain.handle("masko:approval-action", (_event, { id, action, payload }) => {
    if (action === "restore") {
      controller.restoreApproval(id);
      return controller.snapshot();
    }
    controller.resolveApproval(id, action, payload ?? {});
    return controller.snapshot();
  });
  ipcMain.handle("masko:activate-editor", async (_event, payload) => {
    return controller.activation.activateEditor(payload);
  });
  ipcMain.handle("masko:activate-terminal", async (_event, payload) => {
    return controller.activation.activateTerminal(payload);
  });
  ipcMain.handle("masko:detect-claude-runtime", async () => {
    return controller.hookInstaller.diagnose().then((result) => ({
      claudeProcesses: result.claudeProcesses ?? [],
      hookExists: result.hookExists,
      registeredEvents: result.registeredEvents ?? [],
      health: result.health
    }));
  });
  ipcMain.handle("masko:diagnose-hooks", async () => {
    return controller.hookInstaller.diagnose();
  });
  ipcMain.handle("masko:install-hooks", async () => {
    return controller.hookInstaller.install();
  });
  ipcMain.handle("masko:repair-hooks", async () => {
    return controller.hookInstaller.repair();
  });
  ipcMain.on("masko:renderer-log", (_event, payload) => {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const level = payload.level === "error"
      ? "error"
      : payload.level === "warn"
        ? "warn"
        : payload.level === "debug"
          ? "debug"
          : "info";
    const category = typeof payload.category === "string" ? payload.category : "renderer";
    const message = typeof payload.message === "string" ? payload.message : "Renderer log";
    const context = payload.context && typeof payload.context === "object" ? payload.context : {};
    logger?.[level]?.(category, message, context);
  });
  ipcMain.on("masko:set-overlay-bounds", (_event, payload) => {
    if (!overlayWindow || !payload || typeof payload !== "object") {
      return;
    }
    const currentBounds = overlayWindow.getBounds();
    const nextBounds = {
      x: Number.isFinite(payload.x) ? payload.x : currentBounds.x,
      y: Number.isFinite(payload.y) ? payload.y : currentBounds.y,
      width: Number.isFinite(payload.width) ? payload.width : currentBounds.width,
      height: Number.isFinite(payload.height) ? payload.height : currentBounds.height
    };
    overlayWindow.setBounds(nextBounds, false);
    saveSettingsPatch({
      overlayBounds: nextBounds,
      overlayDisplayId: screen.getDisplayMatching(nextBounds)?.id ?? null
    });
  });
}

async function bootstrapClaudeHooks() {
  const smokeTestMs = Number.parseInt(process.env.MASKO_SMOKE_TEST_MS ?? "", 10);
  if (Number.isFinite(smokeTestMs) && smokeTestMs > 0) {
    return {
      ok: true,
      skipped: true,
      reason: "smoke-test"
    };
  }

  try {
    const diagnosis = await controller.hookInstaller.diagnose();
    if (!diagnosis.hookExists || !diagnosis.drift.healthy) {
      const result = diagnosis.hookExists
        ? await controller.hookInstaller.repair()
        : await controller.hookInstaller.install();
      logger?.info("hooks", "Bootstrapped Claude hooks on startup", {
        action: result.action,
        repaired: result.repaired ?? [],
        registeredEvents: result.registeredEvents ?? []
      });
      return result;
    }

    logger?.info("hooks", "Claude hooks already healthy on startup", {
      registeredEvents: diagnosis.registeredEvents
    });
    return {
      ok: true,
      action: "noop",
      registeredEvents: diagnosis.registeredEvents
    };
  } catch (error) {
    logger?.warn("hooks", "Startup hook bootstrap failed", {
      error: String(error.message ?? error)
    });
    return {
      ok: false,
      error: String(error.message ?? error)
    };
  }
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }
  ensureWindows();
  registerMaskoProtocolClient();
  runtimePaths = resolveRuntimePaths();
  settingsStore = new FileSettingsStore(
    path.join(runtimePaths.appData, "masko-code-win64", "settings.json"),
    {
      port: runtimePaths.portOverride ?? 49152,
      editorPreference: "vscode",
      overlayVisible: true,
      showOverlayOnStartup: true,
      openAtLogin: false,
      appShellMode: runtimePaths.appModeOverride ?? "developer",
      overlayDisplayMode: "remember",
      overlayDisplayId: null,
      overlayBounds: null,
      notifications: {
        enabled: true,
        minPriority: "high"
      },
      hotkeys: {
        toggleOverlay: "CommandOrControl+Shift+Space",
        openDiagnostics: "CommandOrControl+Shift+D",
        approveTop: "CommandOrControl+Enter",
        denyTop: "CommandOrControl+Backspace",
        deferTop: "CommandOrControl+Shift+L"
      }
    }
  );
  logger = new RuntimeLogger({
    limit: 1000,
    filePath: path.join(runtimePaths.appData, "masko-code-win64", "logs", "masko-code-win64.log")
  });
  logger.info("startup", "Masko Windows shell starting", {
    appData: runtimePaths.appData,
    home: runtimePaths.home
  });
  mascotLibrary = new MascotLibrary({
    filePath: path.join(runtimePaths.appData, "masko-code-win64", "mascots.json"),
    cacheDir: path.join(runtimePaths.appData, "masko-code-win64", "mascot-assets"),
    logger
  });
  createWindows();
  createTray();
  wireIpc();
  wireDisplayObservers();

  controller = new MaskoCoreController({
    overlay: new ElectronOverlayService(() => overlayWindow, () => diagnosticsWindow),
    notifier: new ElectronNotificationService(
      Notification,
      logger,
      () => showOverlay(),
      () => settingsStore.load().notifications
    ),
    stateStore: new FileJsonStateStore(
      path.join(runtimePaths.appData, "masko-code-win64", "state.json"),
      {
        events: [],
        notifications: [],
        sessions: [],
        settings: settingsStore.load()
      }
    ),
    settings: settingsStore,
    activation: new ElectronActivationService(shell, logger),
    terminalLocator: {},
    hookInstaller: new ElectronHookInstallationService(
      {
        getHomePath: () => runtimePaths.home,
        notificationsSupported: () => Notification.isSupported(),
        getLoginItemSettings: () => app.getLoginItemSettings(),
        runtimeMode: () => runtimeMode()
      },
      settingsStore,
      logger
    ),
    logger
  });

  const smokeTestMs = Number.parseInt(process.env.MASKO_SMOKE_TEST_MS ?? "", 10);
  await startHookServerWithFallback(settingsStore.load().port);
  await bootstrapClaudeHooks();
  broadcastMascotLibrary();
  broadcastSettings();
  await mascotLibrary.warmBundledAssets();
  broadcastMascotLibrary();
  const initialProtocolArg = findMaskoProtocolArg(process.argv);
  if (initialProtocolArg) {
    await handleMaskoProtocol(initialProtocolArg);
  }
  if (!Number.isFinite(smokeTestMs) || smokeTestMs <= 0) {
    applyStartupSettings();
    registerGlobalShortcuts();
  }
  if (settingsStore.load().showOverlayOnStartup && settingsStore.load().overlayVisible) {
    showOverlay();
  }
  if (Number.isFinite(smokeTestMs) && smokeTestMs > 0) {
    setTimeout(() => {
      app.quit();
    }, smokeTestMs);
  }
});

app.on("second-instance", async (_event, argv) => {
  const protocolArg = findMaskoProtocolArg(argv);
  if (protocolArg) {
    await handleMaskoProtocol(protocolArg);
    return;
  }
  showMascotManager();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", async () => {
  app.isQuiting = true;
  globalShortcut.unregisterAll();
  if (hookServer) {
    await hookServer.stop();
  }
});
