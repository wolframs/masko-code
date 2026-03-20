# MSIX Validation Checklist

Use this for the first dev-signed MSIX builds.

## Staging prerequisites

- `npm run assets:windows:pixel`
- `npm run packaging:windows:prepare-app`
- `npm run assets:windows`
- `npm run packaging:windows:manifest`
- packaged Windows app layout copied under [`packaging/windows/input/app`](../../packaging/windows/input/README.md)
- `npm run packaging:windows:stage-msix`
- if Windows SDK tools are available, run the generated `makeappx` and `signtool` commands from the instructions file under `packaging/windows/out`

## Repeated confidence loop

- `npm run packaging:windows:install-msix`
- `npm run packaging:windows:validate-msix -- -ExpectInstalled`
- exercise packaged behavior manually or through additional automation
- `npm run packaging:windows:uninstall-msix`
- `npm run packaging:windows:validate-msix`
- for repeated cycles, use `npm run packaging:windows:loop-msix`

## Install

- install succeeds without developer tool prompts beyond expected certificate trust prompts
- app appears in installed apps list correctly
- app name, icon, and publisher information look correct

## Launch

- app launches successfully from Start menu
- tray icon appears
- overlay opens if configured to show on startup
- mascot manager and diagnostics open successfully

## Data paths

- settings persist across relaunch
- mascot selection persists across relaunch
- mascot asset cache persists across relaunch
- no writes occur inside the package install directory

## Protocol activation

- `masko://install/masko` launches or activates the packaged app
- the app remains single-instance
- mascot manager opens on protocol activation
- mascot install result is visible to the user

## Startup at login

- enabling startup at login persists
- disabling startup at login persists
- behavior still works after relaunch
- behavior is rechecked after a real sign-out/sign-in cycle

## Claude hook flow

- install hooks writes the hook sender file to the expected user profile path
- Claude settings registration is added correctly
- repair flow remains idempotent
- uninstall/cleanup logic removes only Masko-owned hook commands

## Notifications and windows

- native notifications still work from the packaged app
- global hotkeys still register
- overlay positioning still works across multiple monitors

## Uninstall

- uninstall removes the packaged app cleanly
- preserved user data behavior matches the documented policy
- protocol activation no longer points to the packaged app after uninstall
- startup-at-login no longer relaunches the app after uninstall

## Logging and diagnostics

- diagnostics still reflects packaged runtime paths correctly
- no obvious packaged-only errors appear in logs on startup
