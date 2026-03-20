# MSIX Packaging Plan

## Recommendation

Use `MSIX` as the primary Windows packaging target for the Electron shell.

Reasoning:

- aligns with current Microsoft packaging guidance
- strongest path toward Store or certification readiness
- better long-term fit than legacy Electron-first installer approaches
- keeps protocol activation, install identity, and uninstall behavior under a packaging model Microsoft expects

## Scope of this plan

This plan covers:

- package identity and metadata
- signing and dev certificate workflow
- manifest declarations
- protocol activation
- startup-at-login behavior validation
- user-data and uninstall policy
- repo changes needed before the first packaged build

It does not yet implement:

- a final CI release pipeline
- production code signing
- Store submission

## Proposed packaging shape

### App identity

Define a stable packaged identity now and keep it fixed:

- package/app identity: `ai.masko.code.win64`
- display name: `Masko Code`
- publisher: to be finalized once signing identity is known
- executable/display app name: `MaskoCode`

Why this matters:

- protocol registration
- startup tasks
- upgrade paths
- future Store/certification continuity

### Distribution strategy

Primary:

- MSIX package for internal testing and future release readiness

Optional later:

- WiX MSI fallback only if enterprise deployment or non-MSIX distribution becomes necessary

## Repo-specific behavior that must be validated under MSIX

### 1. User data location

Current runtime state lives under:

- `%APPDATA%\masko-code-win64`
- `%USERPROFILE%\.masko-code-win64`
- `%USERPROFILE%\.claude\settings.json`

Packaging implication:

- packaged execution must still be allowed to read/write the user profile paths we depend on
- we must verify that Electron `app.getPath("appData")` resolves as expected in packaged form
- we must avoid any writes to the installation directory

### 2. Protocol activation

Current dev behavior:

- `app.setAsDefaultProtocolClient("masko")`
- startup path also inspects `process.argv` for `masko://...`

Packaging implication:

- packaged MSIX protocol activation must be declared in the manifest
- argv-only assumptions may not be sufficient or may differ from dev behavior
- protocol tests must be run against the packaged app, not inferred from dev runs

### 3. Startup at login

Current behavior:

- Electron `app.setLoginItemSettings`

Packaging implication:

- packaged behavior must be revalidated because dev Electron startup registration is not enough evidence
- we need a packaged validation checklist for enable, disable, relaunch, and uninstall behavior

### 4. Hook installation and cleanup

Current behavior:

- app writes `%USERPROFILE%\.masko-code-win64\hooks\hook-sender.ps1`
- app mutates `%USERPROFILE%\.claude\settings.json`
- cleanup tooling removes only Masko-owned hook commands

Packaging implication:

- uninstall policy must explicitly decide whether app uninstall removes:
  - app data
  - mascot cache
  - Masko Claude hooks
  - protocol registration remnants
- because Claude settings are user-owned, destructive cleanup should likely be opt-in, not implicit

## Packaging phases

## Phase 1: Packaging readiness inside the repo

Deliverables:

- package metadata document
- manifest requirements checklist
- packaged-path validation checklist
- uninstall/data-retention policy

Required repo changes:

1. Normalize app naming and IDs in code
2. Define icon asset set for packaged Windows app
3. Audit all file paths for install-directory writes
4. Add packaged-runtime detection where behavior must differ from dev

## Phase 2: First dev-signed MSIX build

Goal:

- produce a locally installable MSIX for internal testing

Deliverables:

- dev certificate instructions
- package manifest
- build command sequence
- install/uninstall validation worksheet
- staging script for the packaged app layout

Validation targets:

- clean install
- launch
- tray presence
- overlay launch
- mascot manager launch
- protocol activation
- startup-at-login toggle
- Claude hook install/repair
- uninstall

## Phase 3: Packaging hardening

Goal:

- close packaged-only gaps before release tooling

Likely changes:

- packaged protocol activation path if argv handling differs
- packaged startup-at-login behavior fixes
- better first-run onboarding for packaged installs
- clearer packaged uninstall messaging about preserved user data

## Manifest requirements checklist

The MSIX manifest should explicitly cover at minimum:

- identity
- display name and description
- logos/icons
- executable entry point
- protocol declaration for `masko`

Validation questions:

- does packaged protocol activation deliver the full install URL?
- does the packaged app remain single-instance on repeated protocol launches?
- does activation surface the mascot manager correctly?

## Signing plan

### Development

Use a dev certificate for local/internal MSIX installs.

Requirements:

- documented creation/import steps
- trust only in internal test environments
- never mix dev certificate identity with production publisher identity

### Production later

Use a proper code-signing certificate aligned to the final publisher identity.

Requirements later:

- stable publisher string
- reproducible signing in CI
- timestamping

## Uninstall and data policy

Recommended default packaged uninstall behavior:

- remove the packaged app itself
- preserve user-created runtime data by default
- preserve `%USERPROFILE%\.claude\settings.json` modifications by default unless the user explicitly asks for cleanup

Rationale:

- deleting user state or Claude config silently is risky
- mascots, settings, and diagnostics may be user-valued data

Recommended explicit cleanup option in-app:

- `Remove Masko Claude hooks`
- `Clear mascot cache`
- `Reset local app data`

This is safer than assuming the Windows uninstaller should mutate user-owned Claude configuration.

## Highest-risk gaps before the first packaged build

### 1. Protocol activation may differ in packaged MSIX

Current code depends on dev-style protocol registration plus argv discovery.

Action:

- validate with a real packaged build early

### 2. Startup-at-login may differ in packaged form

Current implementation is acceptable for dev, not yet evidence for packaged correctness.

Action:

- validate enable/disable and post-reboot behavior with MSIX

### 3. We do not yet have a dedicated packaged onboarding path

Packaged installs need a clearer first-run path than the current diagnostics-driven setup.

Action:

- add a packaged first-run flow after first MSIX build validation

### 4. Install/uninstall policy is documented but not yet represented in packaged UX

Action:

- add explicit in-app cleanup actions and uninstall messaging before broader testing

## Proposed next implementation step

Build the packaging foundation in-repo:

1. add a Windows packaging folder with MSIX metadata placeholders
2. define app identity, executable name, and icon plan
3. add packaged-runtime checks if needed
4. write a dev-signed MSIX build checklist for local testing

Current status:

- manifest template and rendered dev manifest exist
- visual asset mapping exists
- Electron packaging handoff now exists at [`package-electron-app.ps1`](/C:/Users/w.siener/repos/masko-code-win64/scripts/windows/package-electron-app.ps1)
- a dev MSIX staging script now exists at [`build-dev-msix.ps1`](/C:/Users/w.siener/repos/masko-code-win64/scripts/windows/build-dev-msix.ps1)
- install, uninstall, and validation loop scripts now exist for repeated packaged testing

Current staging command:

```powershell
npm run packaging:windows:prepare-app
npm run packaging:windows:stage-msix
npm run packaging:windows:install-msix
npm run packaging:windows:validate-msix -- -ExpectInstalled
npm run packaging:windows:uninstall-msix
```

The first command now prepares the Electron packaging handoff and can call `electron-packager` if it is explicitly installed. The second command stages the MSIX layout from the produced `packaging/windows/input/app` folder.
