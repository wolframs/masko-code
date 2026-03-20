import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultMascotConfig } from "../renderer/default-mascot-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const defaultsDir = path.join(repoRoot, "Sources", "Resources", "Defaults");

export const bundledPresetSlugs = [
  "madame-patate",
  "otto",
  "cupidon",
  "masko",
  "rusty",
  "nugget",
  "clippy"
];

function readBundledConfig(slug) {
  const filePath = path.join(defaultsDir, `${slug}.json`);
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw.replace(/,\s*([}\]])/g, "$1"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadBundledMascots() {
  const mascots = bundledPresetSlugs.map((slug) => {
    const config = readBundledConfig(slug);
    if (!config) {
      return null;
    }
    return {
      id: `bundled:${slug}`,
      slug,
      source: "bundled",
      addedAt: new Date().toISOString(),
      config
    };
  }).filter(Boolean);

  if (mascots.length === 0) {
    return [
      {
        id: "masko-default",
        slug: "masko",
        source: "bundled",
        addedAt: new Date().toISOString(),
        config: defaultMascotConfig
      }
    ];
  }

  return mascots;
}
