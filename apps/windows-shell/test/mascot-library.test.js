import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MascotLibrary } from "../services/mascot-library.js";

function createTempFilePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "masko-mascots-"));
  return path.join(dir, "mascots.json");
}

test("mascot library seeds the bundled default mascot", () => {
  const library = new MascotLibrary({
    filePath: createTempFilePath(),
    cacheDir: path.join(os.tmpdir(), "masko-mascots-cache-seed"),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    }
  });

  const state = library.list();
  assert.equal(state.mascots.length >= 1, true);
  assert.equal(state.currentMascotId, "bundled:masko");
  assert.equal(state.mascots.some((item) => item.slug === "masko"), true);
  assert.equal(state.mascots.find((item) => item.slug === "masko").name, "Masko");
});

test("mascot library installs a remote mascot by slug and selects it", async () => {
  const library = new MascotLibrary({
    filePath: createTempFilePath(),
    cacheDir: path.join(os.tmpdir(), "masko-mascots-cache-install"),
    fetchImpl: async (url) => {
      if (String(url).endsWith("/api/mascot-templates/remote-rusty")) {
        return {
          ok: true,
          async json() {
            return {
              version: "2.0",
              name: "Rusty",
              initialNode: "idle",
              autoPlay: true,
              nodes: [{ id: "idle", name: "Idle", transparentThumbnailUrl: "https://example.com/rusty.png" }],
              edges: [{ id: "loop", source: "idle", target: "idle", isLoop: true, duration: 4, conditions: [], videos: { webm: "https://example.com/rusty.webm" } }]
            };
          }
        };
      }
      return {
        ok: true,
        async arrayBuffer() {
          return Buffer.from("asset-bytes");
        }
      };
    }
  });

  const result = await library.installFromSlug("remote-rusty");
  assert.equal(result.ok, true);
  assert.equal(result.action, "installed");
  assert.equal(result.mascot.slug, "remote-rusty");
  assert.equal(library.current().id, "slug:remote-rusty");
  assert.equal(result.mascot.config.nodes[0].transparentThumbnailUrl.startsWith("file://"), true);
  assert.equal(result.mascot.config.edges[0].videos.webm.startsWith("file://"), true);
  assert.equal(fs.existsSync(fileURLToPath(result.mascot.config.edges[0].videos.webm)), true);
});

test("mascot library reselects an existing mascot instead of duplicating it", async () => {
  const library = new MascotLibrary({
    filePath: createTempFilePath(),
    cacheDir: path.join(os.tmpdir(), "masko-mascots-cache-existing"),
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          version: "2.0",
          name: "Rusty",
          initialNode: "idle",
          autoPlay: true,
          nodes: [{ id: "idle", name: "Idle", transparentThumbnailUrl: null }],
          edges: [{ id: "loop", source: "idle", target: "idle", isLoop: true, duration: 4, conditions: [], videos: { webm: "https://example.com/rusty.webm" } }]
        };
      },
      async arrayBuffer() {
        return Buffer.from("asset-bytes");
      }
    })
  });

  await library.installFromSlug("rusty");
  const second = await library.installFromSlug("rusty");

  assert.equal(second.ok, true);
  assert.equal(second.action, "selected_existing");
  assert.equal(library.list().mascots.filter((item) => item.slug === "rusty").length, 1);
});

test("mascot library can warm bundled mascot assets into the local cache", async () => {
  const library = new MascotLibrary({
    filePath: createTempFilePath(),
    cacheDir: path.join(os.tmpdir(), "masko-mascots-cache-bundled"),
    fetchImpl: async () => ({
      ok: true,
      async arrayBuffer() {
        return Buffer.from("bundled-asset");
      }
    })
  });

  const warmed = await library.warmBundledAssets();
  assert.equal(warmed.slug, "masko");
  assert.equal(warmed.config.nodes[0].transparentThumbnailUrl.startsWith("file://"), true);
  assert.equal(warmed.config.edges[0].videos.webm.startsWith("file://"), true);
});
