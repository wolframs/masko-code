import test from "node:test";
import assert from "node:assert/strict";
import { defaultMascotConfig } from "../renderer/default-mascot-config.js";
import { MascotStateMachine, mascotInputsFromState } from "../renderer/mascot-state-machine.js";

test("mascot inputs derive working, alert, compacting, and idle state from overlay state", () => {
  const inputs = mascotInputsFromState({
    approvals: [{ id: "a", collapsed: false }],
    sessions: [
      { id: "s1", status: "active", phase: "running", isCompacting: false, lastEventAt: new Date() },
      { id: "s2", status: "active", phase: "idle", isCompacting: true }
    ]
  });

  assert.equal(inputs["claudeCode::isWorking"], true);
  assert.equal(inputs["claudeCode::isIdle"], false);
  assert.equal(inputs["claudeCode::isAlert"], true);
  assert.equal(inputs["claudeCode::isCompacting"], true);
  assert.equal(inputs["claudeCode::sessionCount"], 2);
});

test("mascot inputs treat stale running sessions as idle", () => {
  const inputs = mascotInputsFromState({
    approvals: [],
    sessions: [
      {
        id: "stale",
        status: "active",
        phase: "running",
        isCompacting: false,
        lastEventAt: new Date(Date.now() - 2 * 60_000)
      }
    ]
  });

  assert.equal(inputs["claudeCode::isWorking"], false);
  assert.equal(inputs["claudeCode::isIdle"], true);
  assert.equal(inputs["claudeCode::isCompacting"], false);
});

test("mascot inputs keep sessions with active subagents in working state", () => {
  const inputs = mascotInputsFromState({
    approvals: [],
    sessions: [
      {
        id: "subagent",
        status: "active",
        phase: "idle",
        isCompacting: false,
        activeSubagentCount: 2,
        lastEventAt: new Date(Date.now() - 5 * 60_000)
      }
    ]
  });

  assert.equal(inputs["claudeCode::isWorking"], true);
  assert.equal(inputs["claudeCode::isIdle"], false);
});

test("mascot state machine starts in the configured idle loop", () => {
  const mascot = new MascotStateMachine(defaultMascotConfig);
  const snapshot = mascot.snapshot();

  assert.equal(snapshot.nodeName, "Idle");
  assert.equal(snapshot.phase, "loop");
  assert.match(snapshot.media.url, /\.webm$/);
});

test("mascot state machine prefers alert over working when approvals are visible", () => {
  const mascot = new MascotStateMachine(defaultMascotConfig);

  mascot.applyInputs({
    "claudeCode::isWorking": true,
    "claudeCode::isAlert": true,
    "claudeCode::isCompacting": false,
    "claudeCode::isIdle": false
  });

  const transition = mascot.snapshot();
  assert.equal(transition.phase, "transition");
  assert.match(transition.media.url, /needs-attention/i);

  mascot.handleVideoEnded();
  const settled = mascot.snapshot();
  assert.equal(settled.nodeName, "Needs Attention");
  assert.equal(settled.phase, "loop");
});

test("mascot state machine transitions into compacting and back to idle", () => {
  const mascot = new MascotStateMachine(defaultMascotConfig);

  mascot.applyInputs({
    "claudeCode::isWorking": false,
    "claudeCode::isAlert": false,
    "claudeCode::isCompacting": true,
    "claudeCode::isIdle": false
  });
  mascot.handleVideoEnded();

  assert.equal(mascot.snapshot().nodeName, "Thinking");

  mascot.applyInputs({
    "claudeCode::isWorking": false,
    "claudeCode::isAlert": false,
    "claudeCode::isCompacting": false,
    "claudeCode::isIdle": true
  });
  mascot.handleVideoEnded();

  assert.equal(mascot.snapshot().nodeName, "Idle");
});
