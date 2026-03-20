import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import { InMemoryLogger } from "../../../packages/core/src/logger.js";

function normalizeContext(context) {
  if (!context || typeof context !== "object") {
    return {};
  }
  return context;
}

function formatLine(entry) {
  const context = Object.keys(entry.context ?? {}).length > 0
    ? ` ${util.inspect(entry.context, { depth: 4, breakLength: 120, compact: true })}`
    : "";
  return `${entry.timestamp.toISOString()} [${entry.level}] [${entry.category}] ${entry.message}${context}`;
}

export class RuntimeLogger extends InMemoryLogger {
  constructor({ limit = 1000, filePath, stdout = console.log, stderr = console.error } = {}) {
    super(limit);
    this.filePath = filePath;
    this.stdout = stdout;
    this.stderr = stderr;
  }

  log(level, category, message, context = {}) {
    super.log(level, category, message, context);
    const entry = this.entries[0];
    const line = formatLine({
      ...entry,
      context: normalizeContext(context)
    });

    if (level === "error") {
      this.stderr(line);
    } else {
      this.stdout(line);
    }

    if (!this.filePath) {
      return;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${line}\n`, "utf8");
  }

  debug(category, message, context = {}) {
    this.log("debug", category, message, context);
  }
}
