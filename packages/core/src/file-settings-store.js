import fs from "node:fs";
import path from "node:path";

export class FileSettingsStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      return { ...this.defaults };
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    return {
      ...this.defaults,
      ...JSON.parse(raw)
    };
  }

  save(value) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(value, null, 2));
  }
}
