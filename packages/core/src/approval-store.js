import { HookEventType } from "./event-types.js";
import { eventTypeOf } from "./models.js";

export const PermissionDecision = Object.freeze({
  ALLOW: "allow",
  DENY: "deny",
  DEFER: "defer"
});

function permissionResponse(decision, extra = {}) {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior: decision,
        ...extra
      }
    }
  };
}

export class ApprovalStore {
  constructor() {
    this.pending = [];
    this.collapsedIds = new Set();
    this.preToolUseCache = new Map();
  }

  cachePreToolUse(event) {
    if (!event.sessionId || !event.toolName || !event.toolUseId) {
      return;
    }

    const key = `${event.sessionId}|${event.agentId ?? ""}|${event.toolName}`;
    this.preToolUseCache.set(key, event.toolUseId);
  }

  add(event, resolver) {
    const cacheKey = `${event.sessionId ?? ""}|${event.agentId ?? ""}|${event.toolName ?? ""}`;
    const resolvedId = event.toolUseId ?? this.preToolUseCache.get(cacheKey) ?? null;

    // Duplicate by toolUseId
    if (resolvedId) {
      const dup = this.pending.find(
        (p) => p.event.toolUseId === resolvedId || p.resolvedToolUseId === resolvedId
      );
      if (dup) return dup;
    }

    // Duplicate by canonical signature
    const sig = this.#canonicalSignature(event);
    const dupBySig = this.pending.find((p) => this.#canonicalSignature(p.event) === sig);
    if (dupBySig) return dupBySig;

    const pending = {
      id: crypto.randomUUID(),
      event,
      resolver,
      receivedAt: new Date(),
      resolvedToolUseId: resolvedId
    };

    this.preToolUseCache.delete(cacheKey);
    this.pending.push(pending);
    return pending;
  }

  #canonicalSignature(event) {
    return `${event.sessionId ?? ""}|${event.agentId ?? ""}|${event.toolName ?? ""}|${JSON.stringify(event.toolInput ?? null)}`;
  }

  collapse(id) {
    this.collapsedIds.add(id);
  }

  expand(id) {
    this.collapsedIds.delete(id);
  }

  dismissForSession(sessionId) {
    for (const pending of [...this.pending]) {
      if (pending.event.sessionId === sessionId) {
        this.removeWithoutResponse(pending.id);
      }
    }
  }

  dismissForAgent(sessionId, agentId) {
    for (const pending of [...this.pending]) {
      if (pending.event.sessionId === sessionId && pending.event.agentId === (agentId ?? null)) {
        this.removeWithoutResponse(pending.id);
      }
    }
  }

  dismissByToolUseId(sessionId, toolUseId) {
    const match = this.pending.find(
      (pending) =>
        pending.event.sessionId === sessionId &&
        (pending.event.toolUseId === toolUseId || pending.resolvedToolUseId === toolUseId)
    );

    if (match) {
      this.removeWithoutResponse(match.id);
    }
  }

  resolve(id, decision, extra = {}) {
    const index = this.pending.findIndex((pending) => pending.id === id);
    if (index === -1) {
      return null;
    }

    if (decision === PermissionDecision.DEFER) {
      this.collapsedIds.add(id);
      return this.pending[index];
    }

    const [pending] = this.pending.splice(index, 1);
    this.collapsedIds.delete(id);

    pending.resolver({
      statusCode: decision === PermissionDecision.DENY ? 403 : 200,
      body: permissionResponse(decision, extra)
    });

    return pending;
  }

  removeWithoutResponse(id) {
    const index = this.pending.findIndex((pending) => pending.id === id);
    if (index === -1) {
      return null;
    }

    const [pending] = this.pending.splice(index, 1);
    this.collapsedIds.delete(id);
    pending.resolver(null);
    return pending;
  }

  handleLifecycleEvent(event) {
    const type = eventTypeOf(event);

    if (type === HookEventType.PRE_TOOL_USE) {
      this.cachePreToolUse(event);
      return;
    }

    if (!event.sessionId) {
      return;
    }

    if (type === HookEventType.POST_TOOL_USE || type === HookEventType.POST_TOOL_USE_FAILURE) {
      if (event.toolUseId) {
        this.dismissByToolUseId(event.sessionId, event.toolUseId);
      }
      return;
    }

    if (type === HookEventType.STOP || type === HookEventType.USER_PROMPT_SUBMIT) {
      this.dismissForAgent(event.sessionId, event.agentId ?? null);
    }
  }
}
