# Windows Port Risk Register

| ID | Risk | Impact | Likelihood | Mitigation | Status |
|---|---|---|---|---|---|
| R1 | UI and state are interwoven in `AppStore`, overlay manager, and views | High | High | Move event/session/approval logic into a headless core package before any UI work | Active |
| R2 | macOS focus behavior relies on AppleScript and bundle IDs | High | High | Target coarse Windows activation first, exact terminal parity later | Active |
| R3 | Hook install path differs across PowerShell, CMD, Git Bash, and WSL | High | High | Support a documented MVP matrix and add repair tooling | Active |
| R4 | macOS overlay uses private SkyLight behavior | High | Medium | Drop Space-level parity; use standard always-on-top window semantics on Windows | Active |
| R5 | Windows notification behavior may steal focus or conflict with overlay | Medium | Medium | Keep toasts secondary to in-app overlay and add disable controls | Active |
| R6 | Session interruption detection currently depends on transcript file semantics | Medium | Medium | Keep the heuristic in core but isolate it behind a transcript/session inspection service | Active |
| R7 | Editor exact-tab activation depends on extension cooperation | Medium | Medium | Preserve URI-based extension path for VS Code and Cursor; log fallbacks when exact targeting fails | Active |
| R8 | Packaging and updates are currently DMG + Sparkle only | Medium | High | Defer updater selection until MVP shell is stable; design packaging separately from runtime | Active |
| R9 | macOS resource formats (`.icns`, AppKit video surfaces) do not transfer | Low | High | Treat assets as content only; rebuild shell rendering separately | Active |
| R10 | Trying to preserve macOS hotkey semantics too early will slow MVP | Medium | High | Use standard Windows shortcuts first and leave double-modifier parity as post-MVP | Active |
