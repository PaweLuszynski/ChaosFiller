#!/bin/zsh

set -euo pipefail

APP_NAME="ChaosFill"
DMG_NAME="ChaosFill"
BUILD_CONFIGURATION="${1:-Debug}"
CUSTOM_OUTPUT_PATH="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DERIVED_DATA_ROOT="${DERIVED_DATA_ROOT:-$HOME/Library/Developer/Xcode/DerivedData}"

if [[ -n "$CUSTOM_OUTPUT_PATH" ]]; then
  if [[ "$CUSTOM_OUTPUT_PATH" == *.dmg ]]; then
    OUTPUT_DMG="$CUSTOM_OUTPUT_PATH"
  else
    OUTPUT_DMG="$CUSTOM_OUTPUT_PATH/$DMG_NAME.dmg"
  fi
else
  OUTPUT_DMG="$REPO_ROOT/dist/$DMG_NAME.dmg"
fi

log() {
  echo "[build-dmg] $*"
}

fail() {
  echo "[build-dmg] ERROR: $*" >&2
  exit 1
}

detect_build_path() {
  local detected_path
  detected_path="$(/bin/ls -td "$DERIVED_DATA_ROOT"/"$APP_NAME"-*/Build/Products/"$BUILD_CONFIGURATION"/"$APP_NAME.app" 2>/dev/null | head -n 1 || true)"

  if [[ -z "$detected_path" ]]; then
    detected_path="$(find "$DERIVED_DATA_ROOT" -type d -path "*/Build/Products/$BUILD_CONFIGURATION/$APP_NAME.app" ! -path "*/Index.noindex/*" 2>/dev/null | head -n 1 || true)"
  fi

  echo "$detected_path"
}

BUILD_PATH="$(detect_build_path)"

if [[ -z "$BUILD_PATH" || ! -d "$BUILD_PATH" ]]; then
  fail "Could not find $APP_NAME.app for configuration '$BUILD_CONFIGURATION' in $DERIVED_DATA_ROOT. Build the app in Xcode first."
fi

OUTPUT_DIR="$(dirname "$OUTPUT_DMG")"
mkdir -p "$OUTPUT_DIR"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}-dmg.XXXXXX")"
cleanup() {
  [[ -d "$TEMP_DIR" ]] && rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

log "App bundle: $BUILD_PATH"
log "Temporary folder: $TEMP_DIR"
log "Output DMG: $OUTPUT_DMG"

cp -R "$BUILD_PATH" "$TEMP_DIR/$APP_NAME.app"
ln -s /Applications "$TEMP_DIR/Applications"

rm -f "$OUTPUT_DMG"

hdiutil create -volname "$DMG_NAME" \
  -srcfolder "$TEMP_DIR" \
  -ov -format UDZO \
  "$OUTPUT_DMG"

log "DMG created successfully: $OUTPUT_DMG"
