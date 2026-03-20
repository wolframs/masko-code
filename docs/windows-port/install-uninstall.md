# Windows Install / Uninstall Notes

## Current status

The project is still in development-run mode, not packaged-installer mode.

That means install and uninstall currently mean:

- setting up the repo and dependencies
- running the Electron shell
- creating app runtime state under the current Windows profile
- optionally wiring Claude hooks into the current user's Claude settings
- optionally registering the `masko://` protocol for the dev executable path

## Runtime artifacts created today

### App data

Created under `%APPDATA%\masko-code-win64`:

- `settings.json`
- `state.json`
- `mascots.json`
- `mascot-assets\...`

### Home-profile hook files

Created under `%USERPROFILE%\.masko-code-win64`:

- `hooks\hook-sender.ps1`

### Claude Code settings mutation

Potentially modified:

- `%USERPROFILE%\.claude\settings.json`

Masko adds command hooks for Claude events that invoke the local PowerShell hook sender.

### Windows shell integration

Potentially created or changed:

- login-at-startup registration via Electron `setLoginItemSettings`
- `masko://` protocol registration for the current executable path

## Dev install

Recommended dev install command:

```powershell
npm run dev:install:windows
```

What it does:

1. installs npm workspaces
2. runs the full test suite
3. runs the isolated Electron smoke test once

What it does not do automatically:

- it does not install Claude hooks into your real profile
- it does not force startup-at-login on
- it does not guarantee final installer-grade protocol registration behavior

After that, run the app interactively:

```powershell
npm --workspace @masko/windows-shell run start
```

Then use the app UI to:

- install or repair Claude hooks
- enable startup at login if desired
- verify mascot install and protocol behavior

## Dev uninstall

Recommended conservative uninstall:

```powershell
npm run dev:uninstall:windows
```

That stops running Electron/Masko processes and removes the standalone hook script file if present.

For a fuller cleanup:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\dev-uninstall.ps1 -RemoveClaudeHooks -RemoveAppData -RemoveProtocolRegistration
```

That additionally:

- removes Masko Claude hook registrations from `%USERPROFILE%\.claude\settings.json`
- removes `%APPDATA%\masko-code-win64`
- removes `%USERPROFILE%\.masko-code-win64`
- removes `HKCU:\Software\Classes\masko`

## Windows pitfalls

### 1. Protocol registration can point at the wrong executable

During development, `setAsDefaultProtocolClient` may register the current Electron/dev entry path rather than a future packaged app path.

Implication:

- protocol behavior must be revalidated after packaging
- protocol cleanup during dev may require removing the HKCU `masko` class manually

### 2. Login-item behavior differs between dev and packaged apps

Electron login-item settings are much more trustworthy once the app is packaged.

Implication:

- treat startup-at-login as development-only confidence until we test a packaged build

### 3. Claude hook cleanup must not delete unrelated hooks

Masko is not the only tool that may write to `~/.claude/settings.json`.

Mitigation:

- uninstall cleanup only removes commands referencing Masko's hook sender path
- unrelated hook commands are preserved

### 4. AppData and Home artifacts are separate

Users and testers may remove one and forget the other.

Implication:

- cleanup tooling must handle both `%APPDATA%\masko-code-win64` and `%USERPROFILE%\.masko-code-win64`

### 5. Running processes can keep files locked

Electron processes and spawned helpers may keep state or cache files open.

Mitigation:

- dev uninstall stops `electron*` and `masko*` processes before file cleanup

### 6. Smoke tests must stay isolated

The smoke path must never mutate the user's real Claude or app profile.

Current mitigation:

- smoke runs use repo-local fake `home` and `appdata`
- smoke runs use port `0`

## What still needs packaging-grade work

- choose installer toolchain
- create stable app ID, icon, and executable naming for installer builds
- verify protocol registration and removal in packaged form
- verify login-item enable/disable in packaged form
- implement installer-time uninstall cleanup policy
- decide whether uninstall should preserve user mascots/settings by default or remove them
