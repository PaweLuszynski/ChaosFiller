# ChaosFill

ChaosFill is a Safari Web Extension packaged as a macOS app for configurable form autofill.
It helps you create domain-aware fill rules and generator-based values to speed up repetitive form work.

## Download

- Latest release:  
  https://github.com/PaweLuszynski/ChaosFiller/releases
- Direct download (macOS installer):  
  [ChaosFill.dmg](https://github.com/PaweLuszynski/ChaosFiller/releases/download/v0.1.0/ChaosFill.dmg)

## Features

- Domain-based rules
- Automatic form field detection
- Generator suggestions (`email`, `phone`, `firstName`, `city`, `postalCode`, and more)
- Bulk rule creation from page fields
- Configurable values, matching attributes, and fallback formatting
- Global + per-domain rule management with import/export JSON

## Installation

1. Download `ChaosFill.dmg`.
2. Open the DMG.
3. Drag `ChaosFill.app` to `Applications`.
4. Launch the app.
5. Enable in Safari: `Safari → Settings → Extensions → ChaosFill`.

## Development

- Build from source:
  1. Open `ChaosFill/ChaosFill.xcodeproj` in Xcode.
  2. Select scheme `ChaosFill` and destination `My Mac`.
  3. Run `Product > Clean Build Folder` once.
  4. Press `Run`.
  5. In the host app window, open Safari extension settings and enable `ChaosFill Extension`.
- Build DMG installer:
  - Script: `scripts/build-dmg.sh`
  - Run:
    - `chmod +x scripts/build-dmg.sh`
    - `./scripts/build-dmg.sh`
- Project layout:
  - `ChaosFill/ChaosFill.xcodeproj` (Xcode project)
  - `ChaosFill/ChaosFill/` (macOS host app target)
  - `ChaosFill/ChaosFill Extension/` (Safari extension target handler)
  - `WebExtension/` (`background.js`, `dom.js`, `fill.js`, `options/*`, `manifest.json`, `icons/`)
- Runtime behavior summary:
  - Toolbar fills the most relevant form.
  - Context menu supports field/form fill and rule creation.
  - Rule matching supports `contains` / `equals` / `regex` with target attributes.
  - Options UI is stored in `browser.storage.local`.
- Debugging:
  - Enable Develop menu in Safari: `Safari > Settings > Advanced > Show Develop menu in menu bar`.
  - Use Safari `Develop` menu for content/background inspector logs.
  - In Debug builds, opening extension settings does not auto-terminate the host app, so Xcode logs remain visible.
- CLI build check (example):
  - `xcodebuild -project ChaosFill/ChaosFill.xcodeproj -scheme ChaosFill -configuration Debug -destination 'platform=macOS' -derivedDataPath /tmp/ChaosFillDerived CODE_SIGNING_ALLOWED=NO build`

## Notes

- App is not notarized yet, so macOS may show a security warning.
- Early version.

## Feedback

- Issues: https://github.com/PaweLuszynski/ChaosFiller/issues
