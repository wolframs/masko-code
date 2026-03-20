import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

function extensionForUrl(rawUrl) {
  try {
    const pathname = new URL(rawUrl).pathname;
    const ext = path.extname(pathname);
    return ext || ".bin";
  } catch {
    return ".bin";
  }
}

function stableFileName(rawUrl) {
  const hash = crypto.createHash("sha1").update(rawUrl).digest("hex").slice(0, 12);
  return `${hash}${extensionForUrl(rawUrl)}`;
}

export class MascotAssetCache {
  constructor({ cacheDir, fetchImpl = globalThis.fetch, logger } = {}) {
    this.cacheDir = cacheDir;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async cacheConfigAssets(config) {
    if (!config || typeof config !== "object") {
      return config;
    }

    const nextConfig = structuredClone(config);

    if (Array.isArray(nextConfig.nodes)) {
      for (const node of nextConfig.nodes) {
        node.transparentThumbnailUrl = await this.cacheUrl(node.transparentThumbnailUrl);
      }
    }

    if (Array.isArray(nextConfig.edges)) {
      for (const edge of nextConfig.edges) {
        if (!edge.videos) {
          continue;
        }
        edge.videos.webm = await this.cacheUrl(edge.videos.webm);
        edge.videos.hevc = await this.cacheUrl(edge.videos.hevc);
      }
    }

    return nextConfig;
  }

  async cacheUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
      return rawUrl ?? null;
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
    if (!this.cacheDir || typeof this.fetchImpl !== "function") {
      return rawUrl;
    }

    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const destination = path.join(this.cacheDir, stableFileName(rawUrl));
      if (!fs.existsSync(destination)) {
        const response = await this.fetchImpl(rawUrl);
        if (!response?.ok) {
          return rawUrl;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(destination, bytes);
      }
      return pathToFileURL(destination).toString();
    } catch (error) {
      this.logger?.warn("mascot", "Failed to cache mascot asset", {
        url: rawUrl,
        error: String(error.message ?? error)
      });
      return rawUrl;
    }
  }
}
