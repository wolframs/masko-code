# Icon Asset Plan

## Conclusion

Yes, the reference macOS repo already provides enough raw artwork for the first Windows packaging pass.

## Available source assets

From the reference repo:

- [`app-icon.png`](../../Sources/Resources/Images/app-icon.png)
  - `1024x1024`
  - alpha channel present
- [`logo.png`](../../Sources/Resources/Images/logo.png)
  - `512x512`
  - alpha channel present
- [`AppIcon.icns`](../../Sources/Resources/AppIcon.icns)

## Recommended usage

Use `app-icon.png` as the Windows source-of-truth export asset.

Why:

- high enough resolution for Windows package logos
- simpler and more portable than trying to extract from `.icns`
- already includes transparency

Use `logo.png` only as a secondary brand asset where a simpler mark is preferable.

## What was added

- packaging asset scaffold:
  - [`packaging/windows/assets/README.md`](../../packaging/windows/assets/README.md)
- MSIX asset mapping:
  - [`msix-visual-assets.json`](../../packaging/windows/msix-visual-assets.json)
- export script:
  - [`export-windows-assets.ps1`](../../scripts/windows/export-windows-assets.ps1)
- pixel-art fallback generator:
  - [`generate-pixel-icon.py`](../../scripts/windows/generate-pixel-icon.py)
- npm entry point:
  - `npm run assets:windows`
  - `npm run assets:windows:pixel`
  - `npm run assets:windows:all`
  - `npm run packaging:windows:manifest`

## Current limitation

The main export script generates the PNG asset set from the macOS source artwork.

That is enough to move forward with MSIX visual asset preparation.

The new Python fallback generator can also produce a development-grade pixel-art `.ico` set for Windows packaging experiments without extra dependencies.

## Next step

Once the MSIX manifest template is added, map the generated PNG outputs to the exact manifest logo fields and decide whether the `.ico` should be generated:

- in the repo via an additional export step
- or by the chosen packaging pipeline/tooling

That MSIX mapping step is now scaffolded through [`AppxManifest.template.xml`](../../packaging/windows/AppxManifest.template.xml) and the rendered development manifest path.
