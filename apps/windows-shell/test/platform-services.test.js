import test from "node:test";
import assert from "node:assert/strict";
import {
  ElectronNotificationService,
  __testing
} from "../services/platform-services.js";

class FakeLogger {
  constructor() {
    this.entries = [];
  }

  info(category, message, context) {
    this.entries.push({ level: "info", category, message, context });
  }

  warn(category, message, context) {
    this.entries.push({ level: "warn", category, message, context });
  }

  error(category, message, context) {
    this.entries.push({ level: "error", category, message, context });
  }
}

class FakeNotification {
  static isSupported() {
    return true;
  }

  constructor(payload) {
    this.payload = payload;
    FakeNotification.created.push(this);
  }

  on(eventName, handler) {
    this.handlers ??= {};
    this.handlers[eventName] = handler;
  }

  show() {
    FakeNotification.shown.push(this.payload);
  }
}

FakeNotification.created = [];
FakeNotification.shown = [];

test("notification service suppresses disabled notifications", async () => {
  const logger = new FakeLogger();
  const service = new ElectronNotificationService(
    FakeNotification,
    logger,
    () => {},
    () => ({ enabled: false, minPriority: "high" })
  );

  await service.notify({
    title: "Permission required",
    body: "Approve edit access",
    priority: "urgent"
  });

  assert.equal(FakeNotification.shown.length, 0);
  assert.equal(
    logger.entries.some((entry) => entry.message === "Notification suppressed by preferences"),
    true
  );
});

test("notification service suppresses events below the configured minimum priority", async () => {
  const logger = new FakeLogger();
  FakeNotification.created = [];
  FakeNotification.shown = [];
  const service = new ElectronNotificationService(
    FakeNotification,
    logger,
    () => {},
    () => ({ enabled: true, minPriority: "urgent" })
  );

  await service.notify({
    title: "Task completed",
    body: "Background step finished",
    priority: "high"
  });

  assert.equal(FakeNotification.shown.length, 0);
  assert.equal(
    logger.entries.some((entry) => entry.message === "Notification suppressed below minimum priority"),
    true
  );
});

test("notification service shows notifications that meet the configured threshold", async () => {
  const logger = new FakeLogger();
  FakeNotification.created = [];
  FakeNotification.shown = [];
  let clicked = false;
  const service = new ElectronNotificationService(
    FakeNotification,
    logger,
    () => {
      clicked = true;
    },
    () => ({ enabled: true, minPriority: "normal" })
  );

  await service.notify({
    title: "Permission required",
    body: "Approve edit access",
    priority: "urgent",
    sessionId: "session-1"
  });

  assert.equal(FakeNotification.shown.length, 1);
  assert.equal(FakeNotification.shown[0].urgency, "critical");
  FakeNotification.created[0].handlers.click();
  assert.equal(clicked, true);
});

test("hook drift reports missing events and mismatched commands independently", () => {
  const drift = __testing.describeHookDrift({
    commandMatches: [
      {
        eventName: "PreToolUse",
        commands: ["powershell -ExecutionPolicy Bypass -File \"C:/wrong/path.ps1\""]
      },
      {
        eventName: "PostToolUse",
        commands: []
      }
    ],
    expectedEvents: ["PreToolUse", "PostToolUse", "Notification"],
    expectedHookPath: "C:/expected/hook-sender.ps1"
  });

  assert.equal(drift.healthy, false);
  assert.deepEqual(drift.missingEvents, ["PostToolUse", "Notification"]);
  assert.equal(drift.unexpectedCommands.length, 1);
  assert.equal(drift.unexpectedCommands[0].eventName, "PreToolUse");
});

test("project-aware window ranking prefers full project path and basename matches", () => {
  const ranked = __testing.rankWindowsForProject(
    [
      {
        id: 2,
        processName: "WindowsTerminal",
        mainWindowTitle: "Windows Terminal"
      },
      {
        id: 1,
        processName: "WindowsTerminal",
        mainWindowTitle: "api-service - C:\\Users\\w.siener\\repos\\masko-code-win64 - Windows Terminal"
      }
    ],
    "C:\\Users\\w.siener\\repos\\masko-code-win64",
    ["terminal", "windows terminal", "wt"]
  );

  assert.equal(ranked[0].id, 1);
  assert.equal(ranked[0].matchScore > ranked[1].matchScore, true);
  assert.equal(ranked[0].matchReasons.includes("basename:masko-code-win64"), true);
});

test("hook drift stays healthy when expected commands are present", () => {
  const drift = __testing.describeHookDrift({
    commandMatches: [
      {
        eventName: "PreToolUse",
        commands: ["powershell -ExecutionPolicy Bypass -File \"C:/expected/hook-sender.ps1\""]
      },
      {
        eventName: "Notification",
        commands: ["powershell -ExecutionPolicy Bypass -File \"C:/expected/hook-sender.ps1\""]
      }
    ],
    expectedEvents: ["PreToolUse", "Notification"],
    expectedHookPath: "C:/expected/hook-sender.ps1"
  });

  assert.equal(drift.healthy, true);
  assert.deepEqual(drift.missingEvents, []);
  assert.deepEqual(drift.unexpectedCommands, []);
});
