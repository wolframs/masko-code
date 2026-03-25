import http from "node:http";
import { HookEventType } from "./event-types.js";
import { normalizeEvent } from "./models.js";
import { validateHookPayload } from "./hook-validator.js";

const MAX_BODY_SIZE = 102_400;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let byteLength = 0;
    let rejected = false;

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      byteLength += Buffer.byteLength(chunk, "utf8");
      if (byteLength > MAX_BODY_SIZE) {
        if (!rejected) {
          rejected = true;
          reject(new Error("payload_too_large"));
        }
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        const normalized = data.startsWith("\uFEFF") ? data.slice(1) : data;
        resolve(normalized ? JSON.parse(normalized) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export class HookServer {
  constructor({ controller, host = "127.0.0.1", port = 49152 }) {
    this.controller = controller;
    this.host = host;
    this.port = port;
    this.server = null;
  }

  async start() {
    this.server = http.createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
        return;
      }

      if (req.method === "GET" && req.url === "/state") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(this.controller.snapshot()));
        return;
      }

      if (req.method === "POST" && req.url === "/hook") {
        try {
          const payload = await readJsonBody(req);
          const validation = validateHookPayload(payload);
          if (!validation.ok) {
            this.controller.logger.error("hook", "Hook payload validation failed", {
              issues: validation.issues
            });
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "invalid_hook_payload", issues: validation.issues }));
            return;
          }
          const event = normalizeEvent(payload);

          if (event.hookEventName === HookEventType.PERMISSION_REQUEST) {
            await this.controller.enqueueApproval(event, (response) => {
              if (response === null) {
                if (!res.writableEnded) {
                  res.writeHead(204);
                  res.end();
                }
                return;
              }

              res.writeHead(response.statusCode, {
                "content-type": "application/json"
              });
              res.end(JSON.stringify(response.body));
            });
            // Detect client disconnect -> auto-dismiss
            const pending = this.controller.approvals.pending.find((p) => p.event === event);
            if (pending) {
              res.on("close", () => {
                if (!res.writableFinished) {
                  this.controller.approvals.removeWithoutResponse(pending.id);
                }
              });
            }
            return;
          }

          await this.controller.ingestEvent(event);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          const statusCode = error.message === "payload_too_large" ? 413 : 400;
          this.controller.logger.error("hook", "Hook request failed", {
            error: String(error.message ?? error)
          });
          res.writeHead(statusCode, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(error.message ?? error) }));
        }
        return;
      }

      if (req.method === "POST" && req.url?.startsWith("/approvals/")) {
        const [, , approvalId, action] = req.url.split("/");
        let payload;
        try {
          payload = await readJsonBody(req);
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_json" }));
          return;
        }
        const extra = {};

        if (action === "allowWithAnswers" && payload.answers) {
          extra.updatedInput = { answers: payload.answers };
        } else if (action === "allowWithFeedback" && payload.feedback) {
          extra.updatedInput = { userFeedback: payload.feedback };
        } else if (action === "allowWithPermissions" && payload.updatedPermissions) {
          extra.updatedPermissions = payload.updatedPermissions;
        }

        const decision =
          action === "deny" ? "deny" : action === "defer" ? "defer" : "allow";
        const resolved = this.controller.resolveApproval(approvalId, decision, extra);

        if (!resolved) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "approval_not_found" }));
          return;
        }

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    });

    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off("error", reject);
        const address = this.server.address();
        if (address && typeof address === "object") {
          this.port = address.port;
        }
        resolve();
      });
    });
  }

  async stop() {
    if (!this.server) {
      return;
    }

    await new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = null;
  }
}
