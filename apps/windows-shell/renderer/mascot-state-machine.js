function conditionValue(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return value;
  }
  return Number(value ?? 0);
}

function compareValues(left, op, right) {
  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case "<":
      return left < right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    default:
      return false;
  }
}

function mediaUrlForEdge(edge) {
  return edge?.videos?.webm ?? edge?.videos?.hevc ?? null;
}

function nodeById(config, id) {
  return config.nodes.find((node) => node.id === id) ?? null;
}

function loopEdgeForNode(config, nodeId) {
  return config.edges.find((edge) => edge.source === nodeId && edge.target === nodeId && edge.isLoop) ?? null;
}

function transitionEdgesForNode(config, nodeId) {
  return config.edges.filter((edge) => edge.source === nodeId && !edge.isLoop);
}

function toTimestamp(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function mascotInputsFromState(state) {
  const activeSessions = (state?.sessions ?? []).filter((session) => session.status === "active");
  const visibleApprovals = (state?.approvals ?? []).filter((approval) => !approval.collapsed);
  const staleRunningMs = 90_000;
  const now = Date.now();
  const compacting = activeSessions.some((session) => session.isCompacting || session.phase === "compacting");
  const workingSessions = activeSessions.filter((session) => {
    if ((session.activeSubagentCount ?? 0) > 0) {
      return true;
    }
    if (session.phase !== "running") {
      return false;
    }
    const lastEventAt = toTimestamp(session.lastEventAt);
    if (lastEventAt == null) {
      return true;
    }
    return now - lastEventAt <= staleRunningMs;
  });

  return {
    "claudeCode::isWorking": workingSessions.length > 0,
    "claudeCode::isIdle": activeSessions.length === 0 || (!compacting && workingSessions.length === 0),
    "claudeCode::isAlert": visibleApprovals.length > 0,
    "claudeCode::isCompacting": compacting,
    "claudeCode::sessionCount": activeSessions.length
  };
}

export class MascotStateMachine {
  constructor(config) {
    this.config = config;
    this.inputs = mascotInputsFromState({});
    this.currentNodeId = config.initialNode;
    this.phase = "loop";
    this.pendingEdge = null;
    this.currentMedia = this.#loopMediaForNode(this.currentNodeId);
  }

  get currentNode() {
    return nodeById(this.config, this.currentNodeId);
  }

  get currentNodeName() {
    return this.currentNode?.name ?? this.currentNodeId;
  }

  get currentThumbnailUrl() {
    return this.currentNode?.transparentThumbnailUrl ?? null;
  }

  snapshot() {
    return {
      nodeId: this.currentNodeId,
      nodeName: this.currentNodeName,
      phase: this.phase,
      media: this.currentMedia,
      thumbnailUrl: this.currentThumbnailUrl
    };
  }

  applyInputs(nextInputs) {
    this.inputs = {
      ...this.inputs,
      ...nextInputs
    };
    if (this.phase === "transition") {
      return this.snapshot();
    }
    const edge = this.#matchingTransition();
    if (edge) {
      this.pendingEdge = edge;
      this.phase = "transition";
      this.currentMedia = {
        url: mediaUrlForEdge(edge),
        loop: false
      };
    } else {
      this.phase = "loop";
      this.currentMedia = this.#loopMediaForNode(this.currentNodeId);
    }
    return this.snapshot();
  }

  handleVideoEnded() {
    if (this.phase !== "transition" || !this.pendingEdge) {
      return this.snapshot();
    }
    const targetId = this.pendingEdge.target;
    this.pendingEdge = null;
    this.currentNodeId = targetId;
    this.phase = "loop";
    this.currentMedia = this.#loopMediaForNode(targetId);
    return this.applyInputs({});
  }

  #matchingTransition() {
    for (const edge of transitionEdgesForNode(this.config, this.currentNodeId)) {
      const conditions = Array.isArray(edge.conditions) ? edge.conditions : [];
      if (conditions.length === 0) {
        continue;
      }
      const matched = conditions.every((condition) => {
        const left = conditionValue(this.inputs[condition.input]);
        const right = conditionValue(condition.value);
        return compareValues(left, condition.op ?? "==", right);
      });
      if (matched) {
        return edge;
      }
    }
    return null;
  }

  #loopMediaForNode(nodeId) {
    const edge = loopEdgeForNode(this.config, nodeId);
    return {
      url: mediaUrlForEdge(edge),
      loop: true
    };
  }
}
