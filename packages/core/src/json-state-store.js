import fs from "node:fs";
import path from "node:path";

export class FileJsonStateStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return structuredClone(this.defaults);
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    return {
      ...structuredClone(this.defaults),
      ...JSON.parse(raw)
    };
  }

  save(value) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(value, null, 2));
  }
}

export class InMemoryStateStore {
  constructor(initialValue = {}) {
    this.value = structuredClone(initialValue);
  }

  load() {
    return structuredClone(this.value);
  }

  save(value) {
    this.value = structuredClone(value);
  }
}
