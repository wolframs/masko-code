import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLAUDE_HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "Notification",
  "SessionStart",
  "SessionEnd",
  "TaskCompleted",
  "PermissionRequest",
  "UserPromptSubmit",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "ConfigChange",
  "TeammateIdle",
  "WorktreeCreate",
  "WorktreeRemove"
];

export class ElectronOverlayService {
  constructor(getOverlayWindow, getDiagnosticsWindow) {
    this.getOverlayWindow = getOverlayWindow;
    this.getDiagnosticsWindow = getDiagnosticsWindow;
  }

  showOverlay(state) {
    const window = this.getOverlayWindow();
    if (!window) {
      return;
    }

    window.showInactive();
    window.webContents.send("masko:state", state);
    const diagnostics = this.getDiagnosticsWindow();
    diagnostics?.webContents.send("masko:state", state);
  }

  updateOverlay(state) {
    const window = this.getOverlayWindow();
    window?.webContents.send("masko:state", state);
    const diagnostics = this.getDiagnosticsWindow();
    diagnostics?.webContents.send("masko:state", state);
  }

  hideOverlay() {
    this.getOverlayWindow()?.hide();
  }
}

export class ElectronNotificationService {
  constructor(NotificationCtor, logger, onClick, getPreferences) {
    this.NotificationCtor = NotificationCtor;
    this.logger = logger;
    this.onClick = onClick;
    this.getPreferences = getPreferences;
  }

  async notify(notification) {
    const preferences = this.getPreferences?.() ?? {
      enabled: true,
      minPriority: "high"
    };
    if (!preferences.enabled) {
      this.logger?.info("notification", "Notification suppressed by preferences", {
        title: notification.title
      });
      return;
    }
    if (priorityWeight(notification.priority) < priorityWeight(preferences.minPriority)) {
      this.logger?.info("notification", "Notification suppressed below minimum priority", {
        title: notification.title,
        priority: notification.priority,
        minPriority: preferences.minPriority
      });
      return;
    }
    if (!this.NotificationCtor?.isSupported?.()) {
      this.logger?.warn("notification", "Native notifications are not supported", {});
      return;
    }

    const toast = new this.NotificationCtor({
      title: notification.title,
      body: notification.body ?? "",
      urgency: mapUrgency(notification.priority)
    });
    toast.on("click", () => {
      this.logger?.info("notification", "Notification clicked", {
        title: notification.title,
        sessionId: notification.sessionId ?? null
      });
      this.onClick?.(notification);
    });
    toast.show();
    this.logger?.info("notification", "Native notification shown", {
      title: notification.title,
      priority: notification.priority
    });
  }
}

export class ElectronActivationService {
  constructor(shell, logger) {
    this.shell = shell;
    this.logger = logger;
    this.editorConfigs = [
      {
        id: "vscode",
        scheme: "vscode",
        processNames: ["Code"],
        executables: ["Code.exe"],
        installPaths: [
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
          path.join(process.env["ProgramFiles"] ?? "", "Microsoft VS Code", "Code.exe"),
          path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft VS Code", "Code.exe")
        ]
      },
      {
        id: "cursor",
        scheme: "cursor",
        processNames: ["Cursor"],
        executables: ["Cursor.exe"],
        installPaths: [
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "cursor", "Cursor.exe"),
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Cursor", "Cursor.exe"),
          path.join(process.env["ProgramFiles"] ?? "", "Cursor", "Cursor.exe")
        ]
      }
    ];
    this.terminalConfig = {
      id: "windows-terminal",
      executable: path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps", "wt.exe"),
      processNames: ["WindowsTerminal", "wt"]
    };
  }

  async activateEditor({ editor, shellPid, projectDir }) {
    const config = this.editorConfigs.find((item) => item.id === editor) ?? this.editorConfigs[0];
    this.logger?.info("activation", "Editor activation requested", {
      editor: config.id,
      shellPid: shellPid ?? null,
      projectDir: projectDir ?? null
    });
    const runningWindows = await listRunningWindows(config.processNames);
    const rankedWindows = rankWindowsForProject(runningWindows, projectDir);
    if (runningWindows.length > 0) {
      this.logger?.info("activation", "Detected running editor windows", {
        editor: config.id,
        windows: rankedWindows.map((item) => ({
          pid: item.id,
          title: item.mainWindowTitle,
          score: item.matchScore,
          reasons: item.matchReasons
        }))
      });
    }

    if (shellPid) {
      if (rankedWindows[0]?.id) {
        await focusProcessWindow(rankedWindows[0].id);
      }
      await this.shell.openExternal(`${config.scheme}://masko.masko-terminal-focus/focus?pid=${shellPid}`);
      this.logger?.info("activation", "Editor activation used URI targeting", {
        editor: config.id,
        shellPid
      });
      return {
        ok: true,
        mode: "uri",
        editor: config.id,
        attempts: buildActivationAttempts("uri", rankedWindows, projectDir)
      };
    }

    if (rankedWindows[0]?.id) {
      const focused = await focusProcessWindow(rankedWindows[0].id);
      if (focused.ok) {
        this.logger?.info("activation", "Editor activation foregrounded existing window", {
          editor: config.id,
          pid: rankedWindows[0].id,
          title: rankedWindows[0].mainWindowTitle,
          projectDir: projectDir ?? null
        });
        return {
          ok: true,
          mode: "foreground",
          editor: config.id,
          pid: rankedWindows[0].id,
          attempts: buildActivationAttempts("foreground", rankedWindows, projectDir)
        };
      }
      this.logger?.warn("activation", "Foreground activation failed, falling back", {
        editor: config.id,
        pid: rankedWindows[0].id,
        detail: focused.detail
      });
    }

    const installPath = config.installPaths.find((candidate) => candidate && fs.existsSync(candidate));
    if (installPath) {
      await this.shell.openPath(installPath);
      this.logger?.info("activation", "Editor activation used install path", {
        editor: config.id,
        path: installPath
      });
      return {
        ok: true,
        mode: "path",
        editor: config.id,
        path: installPath,
        attempts: buildActivationAttempts("path", rankedWindows, projectDir)
      };
    }

    try {
      const command = `Start-Process "${config.executables[0]}"`;
      await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true });
      this.logger?.info("activation", "Editor activation used process launch fallback", {
        editor: config.id
      });
      return {
        ok: true,
        mode: "process",
        editor: config.id,
        attempts: buildActivationAttempts("process", rankedWindows, projectDir)
      };
    } catch (error) {
      this.logger?.error("activation", "Editor activation failed", {
        editor: config.id,
        error: String(error.message ?? error)
      });
      return {
        ok: false,
        editor: config.id,
        error: String(error.message ?? error),
        attempts: buildActivationAttempts("error", rankedWindows, projectDir)
      };
    }
  }

  async activateTerminal({ projectDir } = {}) {
    this.logger?.info("activation", "Terminal activation requested", {
      terminal: this.terminalConfig.id,
      projectDir: projectDir ?? null
    });
    const runningWindows = await listRunningWindows(this.terminalConfig.processNames);
    const rankedWindows = rankWindowsForProject(
      runningWindows,
      projectDir,
      ["terminal", "windows terminal", "wt"]
    );
    if (rankedWindows.length > 0) {
      this.logger?.info("activation", "Detected running terminal windows", {
        terminal: this.terminalConfig.id,
        windows: rankedWindows.map((item) => ({
          pid: item.id,
          title: item.mainWindowTitle,
          score: item.matchScore,
          reasons: item.matchReasons
        }))
      });
    }
    if (rankedWindows[0]?.id) {
      const focused = await focusProcessWindow(rankedWindows[0].id);
      if (focused.ok) {
        this.logger?.info("activation", "Terminal activation foregrounded existing window", {
          terminal: this.terminalConfig.id,
          pid: rankedWindows[0].id,
          title: rankedWindows[0].mainWindowTitle,
          projectDir: projectDir ?? null
        });
        return {
          ok: true,
          mode: "foreground",
          terminal: this.terminalConfig.id,
          pid: rankedWindows[0].id,
          attempts: buildActivationAttempts("foreground", rankedWindows, projectDir)
        };
      }
      this.logger?.warn("activation", "Terminal foreground activation failed, falling back", {
        terminal: this.terminalConfig.id,
        pid: rankedWindows[0].id,
        detail: focused.detail
      });
    }

    if (this.terminalConfig.executable && fs.existsSync(this.terminalConfig.executable)) {
      await this.shell.openPath(this.terminalConfig.executable);
      this.logger?.info("activation", "Terminal activation used install path", {
        terminal: this.terminalConfig.id,
        path: this.terminalConfig.executable
      });
      return {
        ok: true,
        mode: "path",
        terminal: this.terminalConfig.id,
        path: this.terminalConfig.executable,
        attempts: buildActivationAttempts("path", rankedWindows, projectDir)
      };
    }

    try {
      await execFileAsync("powershell.exe", ["-NoProfile", "-Command", "Start-Process wt.exe"], {
        windowsHide: true
      });
      this.logger?.info("activation", "Terminal activation used process fallback", {
        terminal: this.terminalConfig.id
      });
      return {
        ok: true,
        mode: "process",
        terminal: this.terminalConfig.id,
        attempts: buildActivationAttempts("process", rankedWindows, projectDir)
      };
    } catch (error) {
      this.logger?.error("activation", "Terminal activation failed", {
        terminal: this.terminalConfig.id,
        error: String(error.message ?? error)
      });
      return {
        ok: false,
        terminal: this.terminalConfig.id,
        error: String(error.message ?? error),
        attempts: buildActivationAttempts("error", rankedWindows, projectDir)
      };
    }
  }
}

export class ElectronHookInstallationService {
  constructor(runtimeContext, settingsStore, logger) {
    this.runtimeContext = runtimeContext;
    this.settingsStore = settingsStore;
    this.logger = logger;
  }

  async install() {
    const settings = this.settingsStore.load();
    const home = this.runtimeContext.getHomePath();
    const claudeDir = path.join(home, ".claude");
    const claudeSettingsPath = path.join(claudeDir, "settings.json");
    const maskoDir = path.join(home, ".masko-code-win64");
    const hookPath = path.join(maskoDir, "hooks", "hook-sender.ps1");

    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });

    const hookScript = [
      "$inputJson = [Console]::In.ReadToEnd()",
      "if (-not $inputJson) { $inputJson = '{}' }",
      `$port = ${settings.port}`,
      "try { Invoke-RestMethod -Method Get -Uri \"http://127.0.0.1:$port/health\" -TimeoutSec 1 | Out-Null } catch { exit 0 }",
      "$payload = $inputJson | ConvertFrom-Json",
      "$payload | Add-Member -NotePropertyName terminal_pid -NotePropertyValue $PID -Force",
      "$payload | Add-Member -NotePropertyName shell_pid -NotePropertyValue $PID -Force",
      "$json = $payload | ConvertTo-Json -Depth 20 -Compress",
      "if ($payload.hook_event_name -eq 'PermissionRequest') {",
      "  try {",
      "    $response = Invoke-WebRequest -Method Post -Uri \"http://127.0.0.1:$port/hook\" -ContentType 'application/json' -Body $json -TimeoutSec 120",
      "    if ($response.Content) { Write-Output $response.Content }",
      "    if ($response.StatusCode -eq 403) { exit 2 }",
      "  } catch { exit 0 }",
      "} else {",
      "  $tempPath = [System.IO.Path]::GetTempFileName()",
      "  try {",
      "    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)",
      "    [System.IO.File]::WriteAllText($tempPath, $json, $utf8NoBom)",
      "    $argumentList = @(",
      "      '-NoProfile',",
      "      '-WindowStyle', 'Hidden',",
      "      '-Command',",
      "      \"try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:$port/hook' -ContentType 'application/json' -InFile '$tempPath' -TimeoutSec 2 | Out-Null } catch { } finally { Remove-Item -LiteralPath '$tempPath' -Force -ErrorAction SilentlyContinue }\"",
      "    )",
      "    Start-Process -FilePath 'powershell.exe' -ArgumentList $argumentList -WindowStyle Hidden | Out-Null",
      "  } catch {",
      "    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue",
      "  }",
      "  exit 0",
      "}"
    ].join("\n");

    fs.writeFileSync(hookPath, hookScript);

    let claudeSettings = {};
    if (fs.existsSync(claudeSettingsPath)) {
      claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, "utf8"));
    }

    claudeSettings.hooks ??= {};

    for (const eventName of CLAUDE_HOOK_EVENTS) {
      claudeSettings.hooks[eventName] ??= [];
      const alreadyInstalled = claudeSettings.hooks[eventName].some((entry) =>
        entry.hooks?.some((hook) => String(hook.command ?? "").includes(hookPath))
      );

      if (!alreadyInstalled) {
        claudeSettings.hooks[eventName].push({
          matcher: "",
          hooks: [
            {
              type: "command",
              command: `powershell -ExecutionPolicy Bypass -File "${hookPath}"`
            }
          ]
        });
      }
    }

    fs.writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2));
    const result = await this.diagnose();
    this.logger?.info("hooks", "Claude hooks installed or updated", {
      claudeSettingsPath,
      hookPath,
      registeredEvents: result.registeredEvents
    });
    return {
      ok: true,
      action: "install",
      claudeSettingsPath,
      hookPath,
      registeredEvents: result.registeredEvents
    };
  }

  async repair() {
    const before = await this.diagnose();
    const installResult = await this.install();
    const after = await this.diagnose();
    const repaired = [];
    if (!before.hookExists && after.hookExists) {
      repaired.push("recreated hook script");
    }
    if (after.registeredEvents.length > before.registeredEvents.length) {
      repaired.push("rewrote Claude hook registration");
    }
    if (after.health.ok) {
      repaired.push("verified local hook server health");
    }
    if (before.drift.missingEvents.length > 0 && after.drift.missingEvents.length === 0) {
      repaired.push("restored missing hook event registrations");
    }
    if (before.drift.unexpectedCommands.length > 0) {
      repaired.push("replaced stale or mismatched hook commands");
    }
    this.logger?.info("hooks", "Claude hooks repaired", {
      repaired,
      beforeDrift: before.drift,
      afterDrift: after.drift
    });
    return {
      ...installResult,
      action: "repair",
      repaired,
      health: after.health,
      driftBefore: before.drift,
      driftAfter: after.drift
    };
  }

  async diagnose() {
    const settings = this.settingsStore.load();
    const home = this.runtimeContext.getHomePath();
    const claudeSettingsPath = path.join(home, ".claude", "settings.json");
    const hookPath = path.join(home, ".masko-code-win64", "hooks", "hook-sender.ps1");
    const claudeSettings = fs.existsSync(claudeSettingsPath)
      ? JSON.parse(fs.readFileSync(claudeSettingsPath, "utf8"))
      : null;

    const hookCommand = `powershell -ExecutionPolicy Bypass -File "${hookPath}"`;
    const registeredEvents = [];
    const commandMatches = [];
    if (claudeSettings?.hooks) {
      for (const [eventName, entries] of Object.entries(claudeSettings.hooks)) {
        const matchingCommands = Array.isArray(entries)
          ? entries.flatMap((entry) => entry.hooks ?? []).map((hook) => String(hook.command ?? ""))
          : [];
        const hasHook = matchingCommands.some((command) => command.includes(hookPath));
        if (hasHook) {
          registeredEvents.push(eventName);
        }
        commandMatches.push({
          eventName,
          commands: matchingCommands
        });
      }
    }

    const environments = await detectShellEnvironments();
    const editors = detectEditors();
    const health = await detectHealth(settings.port);
    const runningWindows = {
      vscode: rankWindowsForProject(await listRunningWindows(["Code"]), null),
      cursor: rankWindowsForProject(await listRunningWindows(["Cursor"]), null),
      windowsTerminal: rankWindowsForProject(await listRunningWindows(["WindowsTerminal", "wt"]), null, ["terminal", "windows terminal", "wt"])
    };
    const claudeProcesses = await detectClaudeProcesses();

    return {
      ok: true,
      port: settings.port,
      platform: os.platform(),
      desktop: {
        notificationsSupported: this.runtimeContext.notificationsSupported?.() ?? false,
        openAtLogin: this.runtimeContext.getLoginItemSettings?.()?.openAtLogin ?? false,
        runtimeMode: this.runtimeContext.runtimeMode?.() ?? { mode: "unknown", isPackaged: false, isDefaultApp: false }
      },
      home,
      claudeSettingsPath,
      claudeSettingsExists: fs.existsSync(claudeSettingsPath),
      hookPath,
      hookExists: fs.existsSync(hookPath),
      hookCommand,
      registeredEvents,
      drift: describeHookDrift({
        commandMatches,
        expectedEvents: CLAUDE_HOOK_EVENTS,
        expectedHookPath: hookPath
      }),
      environments,
      editors,
      claudeProcesses,
      runningWindows,
      health,
      supportTiers: {
        supportedNow: ["PowerShell", "CMD", "Git Bash", "VS Code activation", "Cursor activation"],
        detectedButLimited: ["WSL", "Windows Terminal coarse activation"]
      }
    };
  }
}

export async function detectClaudeProcesses() {
  const script = [
    "$processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {",
    "  $_.ProcessName -like 'claude*' -or ($_.Path -and $_.Path -like '*claude*')",
    "} | Select-Object Id,ProcessName,Path,MainWindowTitle,StartTime",
    "if (-not $processes) { '[]' } else { $processes | ConvertTo-Json -Compress }"
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      timeout: 5000
    });
    const raw = stdout.trim() || "[]";
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item) => ({
      id: item.Id ?? item.id ?? null,
      processName: item.ProcessName ?? item.processName ?? "",
      path: item.Path ?? item.path ?? null,
      mainWindowTitle: item.MainWindowTitle ?? item.mainWindowTitle ?? "",
      startTime: item.StartTime ?? item.startTime ?? null
    }));
  } catch {
    return [];
  }
}

async function detectShellEnvironments() {
  const checks = [
    {
      id: "powershell",
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]
    },
    {
      id: "cmd",
      command: "cmd.exe",
      args: ["/c", "ver"]
    },
    {
      id: "git-bash",
      command: "where.exe",
      args: ["bash.exe"]
    },
    {
      id: "wsl",
      command: "wsl.exe",
      args: ["--status"]
    }
  ];

  const results = [];
  for (const check of checks) {
    try {
      const { stdout } = await execFileAsync(check.command, check.args, { windowsHide: true, timeout: 5000 });
      results.push({
        id: check.id,
        available: true,
        detail: stdout.trim().split(/\r?\n/)[0] ?? ""
      });
    } catch (error) {
      results.push({
        id: check.id,
        available: false,
        detail: String(error.message ?? error)
      });
    }
  }
  return results;
}

function detectEditors() {
  const candidates = [
    {
      id: "vscode",
      paths: [
        path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
        path.join(process.env["ProgramFiles"] ?? "", "Microsoft VS Code", "Code.exe"),
        path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft VS Code", "Code.exe")
      ]
    },
    {
      id: "cursor",
      paths: [
        path.join(process.env.LOCALAPPDATA ?? "", "Programs", "cursor", "Cursor.exe"),
        path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Cursor", "Cursor.exe"),
        path.join(process.env["ProgramFiles"] ?? "", "Cursor", "Cursor.exe")
      ]
    }
  ];

  return candidates.map((candidate) => {
    const detectedPath = candidate.paths.find((item) => item && fs.existsSync(item)) ?? null;
    return {
      id: candidate.id,
      detected: Boolean(detectedPath),
      path: detectedPath
    };
  });
}

function mapUrgency(priority) {
  switch (priority) {
    case "urgent":
      return "critical";
    case "high":
      return "normal";
    default:
      return "low";
  }
}

function priorityWeight(priority) {
  switch (priority) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    default:
      return 1;
  }
}

async function detectHealth(port) {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", `(Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:${port}/health" -TimeoutSec 2).Content`],
      { windowsHide: true, timeout: 4000 }
    );
    return {
      ok: stdout.trim() === "ok",
      detail: stdout.trim()
    };
  } catch (error) {
    return {
      ok: false,
      detail: String(error.message ?? error)
    };
  }
}

async function listRunningWindows(processNames) {
  if (!Array.isArray(processNames) || processNames.length === 0) {
    return [];
  }

  const names = processNames.map((name) => `'${name.replace(/'/g, "''")}'`).join(",");
  const script = [
    `$names = @(${names})`,
    "$processes = Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.ProcessName } | Select-Object Id,ProcessName,MainWindowTitle,Path",
    "if (-not $processes) { '[]' } else { $processes | ConvertTo-Json -Compress }"
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      timeout: 5000
    });
    const raw = stdout.trim() || "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeWindowRecord) : [normalizeWindowRecord(parsed)];
  } catch {
    return [];
  }
}

async function focusProcessWindow(pid) {
  const script = [
    "Add-Type @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class FocusHelper {",
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);',
    "}",
    "'@",
    `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    "if (-not $process -or $process.MainWindowHandle -eq 0) { '{\"ok\":false,\"detail\":\"no_main_window\"}'; exit 0 }",
    "[FocusHelper]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null",
    "$ok = [FocusHelper]::SetForegroundWindow($process.MainWindowHandle)",
    "(@{ ok = $ok; detail = if ($ok) { 'foregrounded' } else { 'set_foreground_failed' } } | ConvertTo-Json -Compress)"
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      windowsHide: true,
      timeout: 5000
    });
    return JSON.parse(stdout.trim() || '{"ok":false,"detail":"empty_response"}');
  } catch (error) {
    return {
      ok: false,
      detail: String(error.message ?? error)
    };
  }
}

function normalizeWindowRecord(record) {
  return {
    id: record.Id ?? record.id ?? null,
    processName: record.ProcessName ?? record.processName ?? "",
    mainWindowTitle: record.MainWindowTitle ?? record.mainWindowTitle ?? "",
    path: record.Path ?? record.path ?? null,
    matchScore: 0,
    matchReasons: []
  };
}

function buildActivationAttempts(mode, runningWindows, projectDir = null) {
  return {
    mode,
    projectDir,
    detectedWindows: runningWindows.map((item) => ({
      pid: item.id,
      processName: item.processName,
      title: item.mainWindowTitle,
      matchScore: item.matchScore,
      matchReasons: item.matchReasons
    })),
    bestMatch: runningWindows[0]
      ? {
          pid: runningWindows[0].id,
          title: runningWindows[0].mainWindowTitle,
          matchScore: runningWindows[0].matchScore,
          matchReasons: runningWindows[0].matchReasons
        }
      : null
  };
}

function describeHookDrift({ commandMatches, expectedEvents, expectedHookPath }) {
  const missingEvents = [];
  const unexpectedCommands = [];

  for (const eventName of expectedEvents) {
    const match = commandMatches.find((item) => item.eventName === eventName);
    if (!match || match.commands.length === 0) {
      missingEvents.push(eventName);
      continue;
    }

    if (!match.commands.some((command) => command.includes(expectedHookPath))) {
      unexpectedCommands.push({
        eventName,
        commands: match.commands
      });
    }
  }

  return {
    healthy: missingEvents.length === 0 && unexpectedCommands.length === 0,
    missingEvents,
    unexpectedCommands
  };
}

function rankWindowsForProject(runningWindows, projectDir, appKeywords = []) {
  if (!projectDir) {
    return runningWindows.map((item) => ({
      ...item,
      ...scoreWindowTitle(String(item.mainWindowTitle ?? "").toLowerCase(), "", "", [], appKeywords)
    }));
  }

  const basename = path.basename(projectDir).toLowerCase();
  const normalizedProject = projectDir.toLowerCase();
  const pathTokens = normalizedProject
    .split(/[\\/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(-4);

  return [...runningWindows]
    .map((item) => {
      const title = String(item.mainWindowTitle ?? "").toLowerCase();
      return {
        ...item,
        ...scoreWindowTitle(title, basename, normalizedProject, pathTokens, appKeywords)
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore || a.id - b.id);
}

function scoreWindowTitle(title, basename, normalizedProject, pathTokens, appKeywords) {
  let matchScore = 0;
  const matchReasons = [];
  if (basename && title.includes(basename)) {
    matchScore += 10;
    matchReasons.push(`basename:${basename}`);
  }
  if (normalizedProject && title.includes(normalizedProject)) {
    matchScore += 20;
    matchReasons.push("full-project-path");
  }
  for (const token of pathTokens) {
    if (token !== basename && title.includes(token)) {
      matchScore += 4;
      matchReasons.push(`path-token:${token}`);
    }
  }
  for (const keyword of appKeywords) {
    if (title.includes(keyword)) {
      matchScore += 1;
      matchReasons.push(`app-keyword:${keyword}`);
    }
  }
  return {
    matchScore,
    matchReasons
  };
}

export const __testing = {
  describeHookDrift,
  priorityWeight,
  rankWindowsForProject,
  scoreWindowTitle
};
