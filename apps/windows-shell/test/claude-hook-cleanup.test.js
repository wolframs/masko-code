import test from "node:test";
import assert from "node:assert/strict";
import { removeMaskoHookRegistrations } from "../services/claude-hook-cleanup.js";

test("removeMaskoHookRegistrations removes only Masko hook commands", () => {
  const input = {
    hooks: {
      PreToolUse: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\dev\\.masko-code-win64\\hooks\\hook-sender.ps1\"" },
            { type: "command", command: "python some-other-hook.py" }
          ]
        }
      ],
      Notification: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\dev\\.masko-code-win64\\hooks\\hook-sender.ps1\"" }
          ]
        }
      ]
    }
  };

  const result = removeMaskoHookRegistrations(input, "C:\\Users\\dev\\.masko-code-win64\\hooks\\hook-sender.ps1");

  assert.equal(result.changed, true);
  assert.deepEqual(result.removedEvents.sort(), ["Notification"]);
  assert.equal(result.updated.hooks.PreToolUse[0].hooks.length, 1);
  assert.equal(result.updated.hooks.PreToolUse[0].hooks[0].command, "python some-other-hook.py");
  assert.equal("Notification" in result.updated.hooks, false);
});

test("removeMaskoHookRegistrations leaves unrelated settings unchanged", () => {
  const input = {
    hooks: {
      SessionStart: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "python keep-me.py" }]
        }
      ]
    }
  };

  const result = removeMaskoHookRegistrations(input, "C:\\Users\\dev\\.masko-code-win64\\hooks\\hook-sender.ps1");

  assert.equal(result.changed, false);
  assert.deepEqual(result.updated, input);
});
