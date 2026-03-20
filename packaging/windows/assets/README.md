# Windows Visual Assets

## Source of truth

Use the existing macOS repo image assets as the raw source:

- `Sources/Resources/Images/app-icon.png`
- `Sources/Resources/Images/logo.png`

Current known dimensions:

- `app-icon.png`: `1024x1024` with alpha
- `logo.png`: `512x512` with alpha

## Why this is enough for now

These source assets are sufficient to generate the first Windows/MSIX visual asset set.

They are large enough for:

- app icon exports
- MSIX logo tiles
- Store/installation visuals

## Expected generated outputs later

- `Square44x44Logo.png`
- `Square50x50Logo.png`
- `Square150x150Logo.png`
- `Square310x310Logo.png`
- `Wide310x150Logo.png`
- `StoreLogo.png`
- `MaskoCode.ico`
- `pixel-art/MaskoCode.ico`

## Notes

- keep generated files out of the source-of-truth path
- regenerate from the source PNG instead of hand-editing individual exports
- treat the source image set as canonical until a Windows-specific redesign is needed
- `scripts/windows/generate-pixel-icon.py` provides a stdlib-only fallback icon set when a Windows-specific `.ico` is needed during development
