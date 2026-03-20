import test from "node:test";
import assert from "node:assert/strict";
import { findMaskoProtocolArg, parseMaskoProtocolUrl } from "../services/masko-protocol.js";

test("parseMaskoProtocolUrl parses install urls with path slug", () => {
  const parsed = parseMaskoProtocolUrl("masko://install/rusty");
  assert.deepEqual(parsed, { action: "install", slug: "rusty" });
});

test("parseMaskoProtocolUrl parses install urls with query slug", () => {
  const parsed = parseMaskoProtocolUrl("masko://install?slug=masko");
  assert.deepEqual(parsed, { action: "install", slug: "masko" });
});

test("parseMaskoProtocolUrl rejects unrelated urls", () => {
  assert.equal(parseMaskoProtocolUrl("https://masko.ai/install/rusty"), null);
  assert.equal(parseMaskoProtocolUrl("masko://unknown/rusty"), null);
});

test("findMaskoProtocolArg returns the masko protocol argument from argv", () => {
  const value = findMaskoProtocolArg(["electron.exe", ".", "masko://install/rusty"]);
  assert.equal(value, "masko://install/rusty");
});

