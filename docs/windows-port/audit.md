# Windows Port Audit

## Summary

The macOS codebase in the repo root (`Sources/`, `Package.swift`) is a macOS 14 SwiftUI/AppKit app with a small portable core embedded inside the UI shell. The Windows migration should be treated as a selective reimplementation with extracted shared logic, not a line-by-line port.

## Repository Shape

### Reusable core

- `Sources/Models/ClaudeEvent.swift`
- `Sources/Models/HookEventType.swift`
- `Sources/Models/AppNotification.swift`
- `Sources/Models/AnyCodable.swift`
- `Sources/Stores/EventStore.swift`
- Most of `Sources/Stores/SessionStore.swift`
- Most of `Sources/Stores/PendingPermissionStore.swift`
- Most of `Sources/Services/EventProcessor.swift`
- The JSON contract embedded in `Sources/Services/HookInstaller.swift`
- `vscode-extension/extension.js`

### Refactorable shared logic

- `Sources/Services/LocalServer.swift`
- `Sources/Utilities/LocalStorage.swift`
- `Sources/Stores/NotificationStore.swift`
- Parts of `Sources/Stores/AppStore.swift`
- `Sources/Models/MaskoCollection.swift` when mascot state is separated from AV/AppKit rendering

### Windows replacement required

- `Sources/App/*`
- `Sources/Views/*`
- `Sources/Services/GlobalHotkeyManager.swift`
- `Sources/Services/NotificationService.swift`
- `Sources/Services/ExtensionInstaller.swift`
- `Sources/Services/HookInstaller.swift` shell script generation and macOS paths
- `Sources/Utilities/IDETerminalFocus.swift`
- `Sources/Utilities/SkyLightOperator.swift`
- `Sources/Utilities/Constants.swift` where values encode macOS assumptions
- `Sources/Utilities/BrandStyles.swift` only as design reference

### Release-only

- `Package.swift`
- `Info.plist`
- `Sources/masko-desktop.entitlements`
- `scripts/create-dmg.sh`
- `scripts/dmg-background.py`
- `Sources/Resources/AppIcon.icns`

## External Dependencies

| Dependency | Current usage | Classification | Windows note |
|---|---|---|---|
| SwiftUI | All UI views | macOS-only | Replace with Windows shell UI technology |
| AppKit | App lifecycle, windows, tray, focus | macOS-only | Replace with Electron/WinUI/Avalonia APIs |
| Sparkle | Auto-updates | replaceable | Replace with Windows updater/installer flow |
| Network (`NWListener`, `NWConnection`) | local HTTP server, held approval sockets | portable concept | Reimplement with Node/HTTP or Windows networking stack |
| Carbon / Accessibility APIs | hotkeys, modifier detection | macOS-only | Replace with Windows global hotkey registration |
| AppleScript / `osascript` | terminal tab focus | macOS-only | Replace with Windows process/window activation + editor URI schemes |
| SkyLight private framework | overlay space management | macOS-only and risky | Drop for MVP |
| VS Code extension API | exact terminal activation in editors | portable | Keep and repackage for Windows editors |

## Claude Code Integration Boundary

The real integration seam is the local HTTP server and the hook JSON contract:

- Hook writer mutates `~/.claude/settings.json`
- Hook script forwards event JSON to local `POST /hook`
- `PermissionRequest` blocks on the response body
- Non-blocking events are fire-and-forget
- The app uses event type, session id, tool metadata, transcript path, and terminal/shell pid enrichment

This boundary is the safest extraction target for a Windows MVP.

## Platform Assumptions To Remove

- `NSHomeDirectory()` and `~/Library/Application Support`
- `~/.masko-desktop/hooks/hook-sender.sh`
- AppleScript activation and TTY matching
- Sparkle update lifecycle
- `NSStatusItem` menu bar behavior
- `NSPanel` always-on-top behavior and Space pinning
- Accessibility trust prompts
- macOS keybindings and double-Command gesture
- `.icns`, `.dmg`, entitlements, and bundle identifiers

## Recommended Extraction Order

1. Freeze the hook event and approval response JSON contract.
2. Move event ingestion, session state, notification derivation, and approval queueing into a headless core package.
3. Define platform service interfaces for overlay, notifications, editor activation, settings, hotkeys, and hook installation.
4. Build a Windows shell around that core.

## Windows MVP Scope

Required now:

- Tray-resident shell
- Always-on-top overlay
- Local hook server
- Approve / deny / defer flows
- Diagnostics/event log
- VS Code and Cursor activation
- Persistent settings

Deferred:

- exact terminal-tab parity outside editor terminals
- macOS visual parity
- multi-monitor polish
- updater parity with Sparkle
- exact double-modifier hotkey behavior
