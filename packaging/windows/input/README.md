# Packaged App Input

Place the packaged Windows app layout for staging here.

Expected first use:

- run `npm run assets:windows:pixel`
- run `npm run packaging:windows:prepare-app`
- unpack or copy the built Windows application files into `packaging/windows/input/app`
- run `npm run assets:windows`
- run `npm run packaging:windows:manifest`
- run `npm run packaging:windows:stage-msix`

Notes:

- this repo does not yet build the packaged Electron app automatically
- `npm run packaging:windows:prepare-app` now writes the exact Electron packaging command and can invoke `electron-packager` if it is installed explicitly
- this folder exists so the MSIX staging script has a predictable input location
- the staged manifest rewrites `Executable="MaskoCode.exe"` to `Executable="app/MaskoCode.exe"` to match this layout
