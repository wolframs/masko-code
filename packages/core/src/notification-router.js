import { HookEventType } from "./event-types.js";
import { createNotification, eventTypeOf, projectNameOf } from "./models.js";

function truncate(text, maxLength) {
  if (!text) {
    return null;
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

export function notificationForEvent(event) {
  const type = eventTypeOf(event);
  const projectName = projectNameOf(event) ?? "a project";

  switch (type) {
    case HookEventType.NOTIFICATION:
      switch (event.notificationType) {
        case "permission_prompt":
          return createNotification({
            title: "Permission Required",
            body: event.message ?? "Claude Code needs your approval to proceed",
            category: "permission_request",
            priority: "urgent",
            sessionId: event.sessionId,
            eventId: event.id
          });
        case "idle_prompt":
          return createNotification({
            title: "Claude is Waiting",
            body: event.message ?? `Claude Code has been idle in ${projectName}`,
            category: "idle_alert",
            priority: "high",
            sessionId: event.sessionId,
            eventId: event.id
          });
        case "elicitation_dialog":
          return createNotification({
            title: "Input Needed",
            body: event.message ?? "Claude Code needs your input",
            category: "elicitation_dialog",
            priority: "high",
            sessionId: event.sessionId,
            eventId: event.id
          });
        default:
          return null;
      }
    case HookEventType.PERMISSION_REQUEST:
      return createNotification({
        title: event.toolName === "AskUserQuestion" ? "Question" : "Permission Requested",
        body:
          event.toolName === "AskUserQuestion"
            ? event.toolInput?.questions?.[0]?.question ?? "Claude Code needs your input"
            : `Claude wants to use ${event.toolName ?? "a tool"} in ${projectName}`,
        category: "permission_request",
        priority: "high",
        sessionId: event.sessionId,
        eventId: event.id
      });
    case HookEventType.STOP:
      return createNotification({
        title: "Task Completed",
        body: truncate(event.lastAssistantMessage, 100) ?? `Claude Code finished in ${projectName}`,
        category: "session_lifecycle",
        priority: "high",
        sessionId: event.sessionId,
        eventId: event.id
      });
    case HookEventType.POST_TOOL_USE_FAILURE:
      return createNotification({
        title: "Tool Failed",
        body: `${event.toolName ?? "A tool"} failed in ${projectName}`,
        category: "tool_failed",
        priority: "normal",
        sessionId: event.sessionId,
        eventId: event.id
      });
    case HookEventType.TASK_COMPLETED:
      return createNotification({
        title: "Task Completed",
        body: event.taskSubject ?? "A task was completed",
        category: "task_completed",
        priority: "high",
        sessionId: event.sessionId,
        eventId: event.id
      });
    case HookEventType.SESSION_START:
      return createNotification({
        title: "Session Started",
        body: `New session in ${projectName}`,
        category: "session_lifecycle",
        priority: "low",
        sessionId: event.sessionId,
        eventId: event.id
      });
    case HookEventType.SESSION_END:
      return createNotification({
        title: "Session Ended",
        body: `Session ended in ${projectName}`,
        category: "session_lifecycle",
        priority: "low",
        sessionId: event.sessionId,
        eventId: event.id
      });
    case HookEventType.PRE_COMPACT:
      return createNotification({
        title: "Context Compacting",
        body: `Claude Code is compacting context in ${projectName}`,
        category: "session_lifecycle",
        priority: "low",
        sessionId: event.sessionId,
        eventId: event.id
      });
    default:
      return null;
  }
}
