# WORKLOG

## Current Context
- Branch: main
- Task: Add reproducible DMG build script for ChaosFill macOS app.
- Status: Completed and locally verified.

## Scope
- Files in scope: `scripts/build-dmg.sh`, `WORKLOG.md`
- Files explicitly out of scope: `WebExtension/*`, app/runtime logic, Xcode project settings

## Recent Changes
- Added `scripts/build-dmg.sh` using native `hdiutil` and DerivedData app auto-detection.
- Added optional script args: build configuration (`Debug`/`Release`) and custom output path.
- Verified output DMG creation at `/tmp/ChaosFill.dmg`.
- Verified DMG mounts with `ChaosFill.app` and `Applications` symlink present.

## Known Issues / Observations
- `hdiutil` operations may fail in sandboxed environments; works when run with normal local macOS permissions.

## Decisions Made
- Kept DMG generation dependency-free (`hdiutil` only).
- Kept layout/styling customization out of scope for reliability and reproducibility.
- Default output path is `dist/ChaosFill.dmg` in repo root.

## Next Steps
- Run `./scripts/build-dmg.sh` after each fresh Xcode app build.
- Optionally run `./scripts/build-dmg.sh Release` for release packaging.

## Validation Checklist
- [x] Build succeeds
- [x] No regression in existing functionality
- [ ] UI behaves correctly
- [ ] Tested in dev/mock mode
- [ ] Tested in real Safari extension (if applicable)

## Environment Notes
- Xcode / build issues: Build app in Xcode first, then run DMG script.
- DerivedData issues: Script auto-detects latest `$HOME/Library/Developer/Xcode/DerivedData/ChaosFill-*/Build/Products/<Config>/ChaosFill.app` and ignores `Index.noindex`.
- Extension reload steps:
- Known pitfalls: If app is missing, script fails with a clear error and exit code 1.

## Usage Rules

- Always update after meaningful changes
- Keep entries short and factual
- Do not duplicate AGENTS.md content
- Treat this file as the single source of truth for current work
- Before starting new work:
  - read this file
  - update "Current Context"
- After finishing work:
  - update "Recent Changes"
  - update "Next Steps"
