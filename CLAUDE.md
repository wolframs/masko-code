# CLAUDE.md

Windows port living alongside the macOS codebase. The macOS source (`Sources/`, `Package.swift`) is in the repo root.
FINAL goal: merge this back upstream via PR when it's done. Definition of done: Get the windows port to complete feature parity with the macos implementation.

## Commands

```bash
npm test                                    # all tests
npm run test:core                           # core package only
npm run test:windows-shell                  # windows shell only
node --test packages/core/test/core.test.js # single file
npm run start:windows-shell                 # launch Electron app
npm run smoke:windows-shell                 # smoke test (auto-exits 3s)
```

## Architecture

npm workspaces monorepo. Core is platform-neutral; shell is Windows/Electron.

- **`packages/core/`** — Hook ingestion, session tracking, approval state machine, notification routing, settings, HTTP hook server. No Electron deps.
- **`apps/windows-shell/`** — Electron shell: tray, overlay/diagnostics/mascot windows, IPC bridge, platform service implementations.

### Core (`packages/core/src/`)

- **`MaskoCoreController`** — Orchestrator. Constructor-injected platform services (overlay, notifier, stateStore, settings, activation, terminalLocator, hookInstaller, logger).
- **`HookServer`** — HTTP on `127.0.0.1:49152`. Routes: `GET /health`, `GET /state`, `POST /hook`, `POST /approvals/:id/:action`.
- **`platform-service-contracts.js`** — Abstract bases the shell must implement. Core never imports Electron.
- **`models.js`** — `normalizeEvent()` converts snake_case hook payloads to camelCase.
- **`contracts/`** — JSON Schema for hook events and permission responses.

### Shell (`apps/windows-shell/`)

- **`main.js`** — Electron main process, single-instance lock, `masko://` protocol handler.
- **`services/platform-services.js`** — Electron implementations of core contracts. Editor/terminal activation via PowerShell + Win32 `SetForegroundWindow`.
- **`renderer/`** — HTML + vanilla JS, no bundler.
- **`preload.js`** — Context bridge exposing `window.masko`.

### Hook Integration

`ElectronHookInstallationService` writes hooks into `~/.claude/settings.json`. A generated PowerShell script (`~/.masko-code-win64/hooks/hook-sender.ps1`) forwards events to the local server. Permission requests block; everything else fires-and-forgets via background PowerShell.

## Conventions

- ESM everywhere, `.js` extensions in imports
- No transpilation or bundling — plain Node.js + vanilla browser JS
- Tests: `node:test` + `node:assert/strict`, fakes defined inline
- **TDD: write failing tests first, then implement to make them pass**
- Constructor injection for all platform services
- Snake_case payloads from Claude hooks → camelCase at `normalizeEvent()` boundary
- Windows platform calls via PowerShell through `child_process.execFile`
