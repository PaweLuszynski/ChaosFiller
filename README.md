# ChaosFill

Safari Web Extension (WebExtensions-style) packaged in a minimal macOS host app, generated from Apple’s Safari Web Extension App flow.

## Start Project (Clean Setup)

1. Clone the repo and open:
   - `ChaosFill/ChaosFill.xcodeproj`
2. In Xcode:
   - select scheme `ChaosFill`
   - select destination `My Mac`
   - run `Product > Clean Build Folder` once
   - press `Run`
3. In the ChaosFill host app window, click the button to open Safari extension settings.
4. In Safari:
   - open `Safari > Settings > Extensions`
   - enable `ChaosFill Extension`
   - set website access to all websites for development
5. If you previously used older app names and see duplicate entries:
   - quit Safari
   - remove old app copies from `/Applications` and `~/Applications`
   - relaunch Safari and enable only `ChaosFill Extension`

## Project Layout

- `ChaosFill/`
  - `ChaosFill.xcodeproj` (Xcode project)
  - `ChaosFill/` (macOS host app target)
  - `ChaosFill Extension/` (Safari extension target handler)
- `WebExtension/`
  - `manifest.json`
  - `background.js`
  - `content.js`
  - `storage.js`
  - `rules.js`
  - `generators.js`
  - `dom.js`
  - `fill.js`
  - `options/` (`options.html`, `options.js`, `options.css`)
  - `icons/`

## Implemented Behavior (MVP)

- Toolbar button fills the most relevant form:
  - focused field’s form if focused field is inside a form
  - otherwise the form with the most visible fillable fields
- Context menu:
  - Fill this field
  - Fill this form
  - Add this field to configuration (creates a new rule from the clicked field)
  - Add all editable fields to configuration (creates rules for all fillable fields on the page)
- Supported controls:
  - `textarea`
  - `input[type=radio]`
  - `input[type=checkbox]`
  - `input[type=date]`
  - `input[type=datetime-local]`
  - text-ish inputs: `text/email/tel/number/password/url/search`
  - `select`
- Ignores hidden/disabled/readonly/invisible elements (configurable)
- Domain blocking:
  - user ignored domains (regex list)
  - default sensitive denylist (host/path patterns), toggleable
- Rule engine with priority order:
  - `contains` / `equals` / `regex`
  - per-rule target attribute: `any`, `id`, `name`, `placeholder`, `label`, `aria-label`, `aria-labelledby`, `class`, `type`
  - match pattern supports multiple options separated by `;` and optional per-option target prefix (for example `id:...; name:...`)
  - optional per-rule output mask (for example `DE#########`)
  - optional per-domain regex
  - enabled/disabled + reorder
- Built-in generators:
  - `firstName`, `lastName`, `fullName`, `email`, `number`, `phone`, `company`, `street`, `city`, `zip`, `country`, `iban`, `bic`, `vatId`, `password`, `lorem`, `randomized-list`
- Options UI stored in `browser.storage.local`:
  - rules editor
  - password mode
  - field/general toggles
  - fallback formatting controls (including editable email domain, default `example.com`)
  - attribute matching toggles
  - ignored domains
  - import/export JSON

## How to Run (Exact Steps)

1. Clone the repo.
2. Open Xcode project: `ChaosFill/ChaosFill.xcodeproj`.
3. In Xcode, select scheme `ChaosFill`, target device `My Mac`.
4. Press Run.
5. In the host app window, click the button to open Safari extension settings.
6. In Safari, go to `Safari > Settings > Extensions`.
7. Enable `ChaosFill Extension`.
8. Set website access to all websites for development (`Always Allow on Every Website` or equivalent Safari wording).
9. Open any page with a form and:
   - click extension toolbar button to fill best form, or
   - right-click a field and use `Fill this field` / `Fill this form`.

## Debugging

1. Enable Develop menu: `Safari > Settings > Advanced > Show Develop menu in menu bar`.
2. Use `Develop` menu to inspect page content scripts.
3. Use extension inspector/background inspector from Develop menu for extension logs.
4. In Xcode, monitor host app logs and extension build/runtime errors.
5. In DEBUG builds, opening Safari extension settings does not auto-terminate the host app, so Xcode stays attached and host logs remain visible.

## Build Verification (done)

The project builds successfully from CLI:

```bash
xcodebuild -project ChaosFill/ChaosFill.xcodeproj -scheme ChaosFill -configuration Debug -destination 'platform=macOS' -derivedDataPath /tmp/ChaosFillDerived CODE_SIGNING_ALLOWED=NO build
```
