# Windows Packaging Scaffold

This folder is the landing place for the future MSIX packaging inputs.

## Current contents

- `package-metadata.json`
  - stable Windows package identity and display metadata
- `msix-visual-assets.json`
  - explicit mapping from generated repo assets into MSIX logo fields
- `AppxManifest.template.xml`
  - manifest template with package identity, visual assets, and protocol declarations
- `AppxManifest.dev.xml`
  - rendered development manifest output generated from repo metadata
- `input/`
  - placeholder location for the packaged Windows app layout before MSIX staging
- `electron-packager.config.json`
  - conservative packaging config for producing the Windows app folder that feeds MSIX staging

## Intended future contents

- visual assets and icon exports
- signing/dev certificate notes
- build scripts for dev-signed MSIX generation

## Rules

- keep package identity stable once external testing begins
- do not reuse the development publisher value for production signing
- validate protocol activation and startup-at-login only against packaged builds, not dev runs
- regenerate `AppxManifest.dev.xml` via `npm run packaging:windows:manifest` instead of hand-editing it
- prepare the packaged Electron app handoff via `npm run packaging:windows:prepare-app`
- stage a development MSIX layout via `npm run packaging:windows:stage-msix`
- install and uninstall the staged MSIX via the dedicated PowerShell loop scripts instead of ad hoc shell commands
