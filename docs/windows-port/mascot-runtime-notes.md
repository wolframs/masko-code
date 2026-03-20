# Maskot Runtime Notes

## What the macOS app actually does

- The desktop app does not implement a visible user-auth flow for `masko.ai`.
- Built-in mascots are bundled as JSON animation configs under `Sources/Resources/Defaults/*.json`.
- Community mascots are installed through a `masko://install/<slug>` deep link.
- The app resolves that slug by fetching `https://masko.ai/api/mascot-templates/<slug>` in production.
- A fetched mascot is stored locally as a `MaskoAnimationConfig` in the mascot store.

## What a mascot is

- A mascot is not a single sprite sheet.
- It is a state machine config with:
  - nodes
  - edges
  - conditions
  - named inputs
  - per-edge video URLs
- The macOS app drives those inputs from Claude session state and UI events like click and hover.

## How animation playback works

- The animation runtime uses the config's current node plus matching outgoing edges.
- Loop edges provide the idle or sustained-state video.
- Transition edges provide one-shot videos between states.
- Video files are downloaded and cached locally for reuse.
- The macOS implementation prefers HEVC videos with alpha for transparent mascot playback.

## Implications for Windows

- We do not need account auth just to support real mascots for the MVP.
- We do need:
  - a local mascot store
  - bundled default mascot configs
  - remote config fetch by slug
  - a Windows-safe animation playback path for transparent video
  - a small state-machine runtime equivalent to the macOS one
- The biggest technical risk is transparent video playback in Electron on Windows, not remote mascot lookup.

## Recommended Windows path

1. Import one bundled default mascot config into the Windows app.
2. Reuse the existing portable Claude session inputs to drive a JS state machine.
3. Start with a minimal animation runtime:
   - idle
   - working
   - alert
   - compacting
4. Support `masko://install/<slug>` later, after local bundled mascot playback is working.
5. Treat remote mascot fetching as unauthenticated unless the web API proves otherwise during implementation.
