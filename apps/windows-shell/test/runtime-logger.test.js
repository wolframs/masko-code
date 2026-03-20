import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeLogger } from "../services/runtime-logger.js";

test("runtime logger writes to memory and file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "masko-runtime-logger-"));
  const filePath = path.join(tempDir, "masko.log");
  const stdoutLines = [];
  const stderrLines = [];
  const logger = new RuntimeLogger({
    filePath,
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line)
  });

  logger.info("startup", "Logger online", { port: 49152 });
  logger.error("renderer", "Renderer crashed", { window: "overlay" });

  const logFile = fs.readFileSync(filePath, "utf8");
  assert.equal(logger.entries.length, 2);
  assert.equal(stdoutLines.length, 1);
  assert.equal(stderrLines.length, 1);
  assert.match(logFile, /\[info\] \[startup\] Logger online/);
  assert.match(logFile, /\[error\] \[renderer\] Renderer crashed/);
});
