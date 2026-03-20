# File Migration Matrix

Classification values:

- `Reusable core`
- `Refactorable shared logic`
- `Windows replacement required`
- `Release-only`

| File | Classification | Notes |
|---|---|---|
| `.gitignore` | Release-only | Repo metadata, not runtime logic |
| `.swiftlint.yml` | Release-only | Swift lint config for reference code |
| `CONTRIBUTING.md` | Release-only | Process documentation only |
| `Info.plist` | Release-only | macOS app manifest |
| `LICENSE` | Release-only | Keep as project metadata |
| `Package.swift` | Release-only | SwiftPM packaging and Sparkle dependency |
| `README.md` | Release-only | Product and macOS setup docs, useful as reference |
| `scripts/create-dmg.sh` | Release-only | macOS DMG packaging |
| `scripts/dmg-background.py` | Release-only | DMG asset generation |
| `vscode-extension/package.json` | Reusable core | VS Code/Cursor extension manifest can be repackaged |
| `vscode-extension/extension.js` | Reusable core | URI-based terminal focus logic survives on Windows editors |
| `Sources/App/MaskoDesktopApp.swift` | Windows replacement required | AppKit lifecycle, Sparkle, status item, window activation |
| `Sources/App/ContentView.swift` | Windows replacement required | SwiftUI shell composition |
| `Sources/Debug/PerfMonitor.swift` | Refactorable shared logic | Optional diagnostics logic; no need for MVP |
| `Sources/Debug/PerfOverlayView.swift` | Windows replacement required | Debug UI only |
| `Sources/Models/AnyCodable.swift` | Reusable core | Generic JSON carrier for hook payloads |
| `Sources/Models/AppNotification.swift` | Reusable core | Notification model portable |
| `Sources/Models/ClaudeEvent.swift` | Reusable core | Core hook event contract |
| `Sources/Models/HookEventType.swift` | Reusable core | Portable event enumeration |
| `Sources/Models/MaskoCollection.swift` | Refactorable shared logic | Mascot state/content model is portable; rendering is not |
| `Sources/Resources/AppIcon.icns` | Release-only | Replace with Windows `.ico` |
| `Sources/Resources/Defaults/clippy.json` | Refactorable shared logic | Mascot data portable if format is kept |
| `Sources/Resources/Defaults/cupidon.json` | Refactorable shared logic | Mascot data portable if format is kept |
| `Sources/Resources/Defaults/madame-patate.json` | Refactorable shared logic | Mascot data portable if format is kept |
| `Sources/Resources/Defaults/masko.json` | Refactorable shared logic | Mascot data portable if format is kept |
| `Sources/Resources/Defaults/nugget.json` | Refactorable shared logic | Mascot data portable if format is kept |
| `Sources/Resources/Defaults/otto.json` | Refactorable shared logic | Mascot data portable if format is kept |
| `Sources/Resources/Defaults/rusty.json` | Refactorable shared logic | Mascot data portable if format is kept |
| `Sources/Resources/Extensions/masko-terminal-focus.vsix` | Reusable core | Bundled editor extension asset remains useful |
| `Sources/Resources/Fonts/Fredoka-Bold.ttf` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Fonts/Fredoka-Medium.ttf` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Fonts/Fredoka-Regular.ttf` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Fonts/Fredoka-SemiBold.ttf` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Fonts/Rubik-Medium.ttf` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Fonts/Rubik-Regular.ttf` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Fonts/Rubik-SemiBold.ttf` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Images/app-icon.png` | Refactorable shared logic | Portable asset |
| `Sources/Resources/Images/logo.png` | Refactorable shared logic | Portable asset |
| `Sources/Services/EventProcessor.swift` | Reusable core | Notification derivation and event routing are portable |
| `Sources/Services/ExtensionInstaller.swift` | Windows replacement required | Rework CLI detection and VSIX install paths for Windows |
| `Sources/Services/GlobalHotkeyManager.swift` | Windows replacement required | Carbon/accessibility-specific |
| `Sources/Services/HookInstaller.swift` | Refactorable shared logic | Keep hook contract, replace path and script generation |
| `Sources/Services/LocalServer.swift` | Refactorable shared logic | Server behavior portable, implementation is macOS-specific |
| `Sources/Services/NotificationService.swift` | Windows replacement required | Uses `UNUserNotificationCenter` and `NSApp` |
| `Sources/Services/OverlayStateMachine.swift` | Refactorable shared logic | State logic is portable if separated from views |
| `Sources/Services/VideoCache.swift` | Refactorable shared logic | Cache policy portable, media plumbing may differ |
| `Sources/Stores/AppStore.swift` | Refactorable shared logic | Good extraction source for orchestration, but mixed with AppKit |
| `Sources/Stores/EventStore.swift` | Reusable core | Portable event persistence list |
| `Sources/Stores/MascotStore.swift` | Refactorable shared logic | Data loading portable; AV/UI linkage not |
| `Sources/Stores/NotificationStore.swift` | Refactorable shared logic | Portable persistence with minor refactor |
| `Sources/Stores/PendingPermissionStore.swift` | Reusable core | Approval queue, protocol responses, parsing helpers |
| `Sources/Stores/SessionFinishedStore.swift` | Refactorable shared logic | Simple UI state, keep if still needed |
| `Sources/Stores/SessionStore.swift` | Reusable core | Session state machine and reconciliation logic |
| `Sources/Stores/SessionSwitcherStore.swift` | Refactorable shared logic | Portable selection state, UI-specific usage |
| `Sources/Utilities/BrandStyles.swift` | Windows replacement required | SwiftUI styling reference only |
| `Sources/Utilities/Constants.swift` | Refactorable shared logic | Split portable config from platform values |
| `Sources/Utilities/IDETerminalFocus.swift` | Windows replacement required | AppleScript and AppKit focus logic |
| `Sources/Utilities/LocalStorage.swift` | Refactorable shared logic | Replace path resolution with Windows app data |
| `Sources/Utilities/SkyLightOperator.swift` | Windows replacement required | macOS private framework usage |
| `Sources/Views/ActivityFeed/ActivityFeedView.swift` | Windows replacement required | SwiftUI UI |
| `Sources/Views/Approvals/ApprovalRequestView.swift` | Windows replacement required | SwiftUI UI |
| `Sources/Views/Masko/MaskoDashboardView.swift` | Windows replacement required | SwiftUI + AppKit editor/menu wrappers |
| `Sources/Views/Masko/MascotDetailView.swift` | Windows replacement required | SwiftUI mascot editor/detail UI |
| `Sources/Views/MenuBar/MenuBarView.swift` | Windows replacement required | macOS menu bar UI |
| `Sources/Views/Notifications/NotificationCenterView.swift` | Windows replacement required | SwiftUI UI |
| `Sources/Views/Onboarding/OnboardingView.swift` | Windows replacement required | macOS permissions/install UI |
| `Sources/Views/Overlay/OverlayContextPanel.swift` | Windows replacement required | AppKit floating panel and input handling |
| `Sources/Views/Overlay/OverlayManager.swift` | Windows replacement required | AppKit panels and window coordination |
| `Sources/Views/Overlay/OverlayMascotView.swift` | Windows replacement required | AppKit/AV rendering |
| `Sources/Views/Overlay/OverlayPanel.swift` | Windows replacement required | NSPanel subclass |
| `Sources/Views/Overlay/OverlayStateMachineView.swift` | Windows replacement required | SwiftUI/AV render layer |
| `Sources/Views/Overlay/PermissionPromptView.swift` | Windows replacement required | SwiftUI approval UI |
| `Sources/Views/Overlay/ResizeHandleView.swift` | Windows replacement required | AppKit mouse tracking |
| `Sources/Views/Overlay/SessionFinishedToast.swift` | Windows replacement required | SwiftUI toast UI |
| `Sources/Views/Overlay/SessionSwitcherView.swift` | Windows replacement required | SwiftUI switcher UI |
| `Sources/Views/Overlay/StatsOverlayView.swift` | Windows replacement required | SwiftUI stats UI |
| `Sources/Views/Sessions/SessionListView.swift` | Windows replacement required | SwiftUI session list |
| `Sources/Views/Settings/SettingsView.swift` | Windows replacement required | SwiftUI settings + macOS filesystem cleanup |
| `Sources/Views/Shared/MascotVideoView.swift` | Windows replacement required | NSView/AVKit bridge |
| `Sources/masko-desktop.entitlements` | Release-only | macOS entitlements |

## Folder-Level Migration Order

1. `Sources/Models`, `Sources/Stores/EventStore.swift`, `Sources/Stores/SessionStore.swift`, `Sources/Stores/PendingPermissionStore.swift`, `Sources/Services/EventProcessor.swift`
2. `Sources/Services/LocalServer.swift`, `Sources/Utilities/LocalStorage.swift`, contract pieces from `Sources/Services/HookInstaller.swift`
3. `vscode-extension/`
4. Windows shell replacement for `Sources/App`, `Sources/Views`, hotkeys, notifications, focus, and packaging
