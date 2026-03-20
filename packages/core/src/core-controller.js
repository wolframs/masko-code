import { ApprovalStore } from "./approval-store.js";
import { notificationForEvent } from "./notification-router.js";
import { SessionStore } from "./session-store.js";
import { InMemoryLogger } from "./logger.js";
import { InMemoryStateStore } from "./json-state-store.js";

export class MaskoCoreController {
  constructor({
    overlay,
    notifier,
    stateStore,
    settings,
    activation,
    terminalLocator,
    hookInstaller,
    logger
  }) {
    this.overlay = overlay;
    this.notifier = notifier;
    this.stateStore = stateStore ?? new InMemoryStateStore({
      events: [],
      notifications: [],
      sessions: [],
      settings: {}
    });
    this.settings = settings;
    this.activation = activation;
    this.terminalLocator = terminalLocator;
    this.hookInstaller = hookInstaller;
    this.logger = logger ?? new InMemoryLogger();
    const persisted = this.stateStore.load();
    this.events = persisted.events ?? [];
    this.notifications = persisted.notifications ?? [];
    this.sessions = new SessionStore(persisted.sessions ?? []);
    this.approvals = new ApprovalStore();
  }

  async ingestEvent(event) {
    this.logger.info("hook", "Hook event ingested", {
      hookEventName: event.hookEventName,
      sessionId: event.sessionId,
      toolName: event.toolName
    });
    this.events.unshift(event);
    this.approvals.handleLifecycleEvent(event);
    this.sessions.recordEvent(event);

    const notification = notificationForEvent(event);
    if (notification) {
      this.notifications.unshift(notification);
      await this.notifier.notify(notification);
      this.logger.info("notification", "Notification derived from hook event", {
        notificationTitle: notification.title,
        sessionId: notification.sessionId
      });
    }

    this.persistState();
    this.overlay.updateOverlay(this.snapshot());
    return this.snapshot();
  }

  async enqueueApproval(event, resolver) {
    const pending = this.approvals.add(event, resolver);
    this.logger.info("approval", "Approval queued", {
      approvalId: pending.id,
      sessionId: event.sessionId,
      toolName: event.toolName
    });
    await this.ingestEvent(event);
    this.overlay.showOverlay(this.snapshot());
    return this.snapshot();
  }

  resolveApproval(id, decision, extra = {}) {
    const resolved = this.approvals.resolve(id, decision, extra);
    if (resolved) {
      this.logger.info("approval", "Approval state changed", {
        approvalId: id,
        decision,
        sessionId: resolved.event.sessionId,
        toolName: resolved.event.toolName
      });
    } else {
      this.logger.warn("approval", "Approval action targeted unknown id", { approvalId: id, decision });
    }
    this.persistState();
    this.overlay.updateOverlay(this.snapshot());
    return resolved;
  }

  restoreApproval(id) {
    this.approvals.expand(id);
    this.logger.info("approval", "Deferred approval restored", {
      approvalId: id
    });
    this.persistState();
    this.overlay.updateOverlay(this.snapshot());
    return this.snapshot();
  }

  persistState() {
    this.stateStore.save({
      events: this.events.slice(0, 200),
      notifications: this.notifications.slice(0, 200),
      sessions: this.sessions.sessions,
      settings: typeof this.settings?.load === "function" ? this.settings.load() : {}
    });
  }

  snapshot() {
    return {
      approvals: this.approvals.pending.map((item) => ({
        id: item.id,
        event: item.event,
        collapsed: this.approvals.collapsedIds.has(item.id),
        resolvedToolUseId: item.resolvedToolUseId
      })),
      sessions: this.sessions.sessions,
      notifications: this.notifications.slice(0, 50),
      events: this.events.slice(0, 200),
      logs: this.logger.entries?.slice(0, 200) ?? []
    };
  }
}
