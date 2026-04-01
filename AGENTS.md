# AGENTS.md

## 1. Project Overview

- This repository is a Safari Web Extension project built and packaged via Xcode.
- Core purpose: autofill forms using configurable matching rules and a generator suggestion engine.
- Main components:
  - `WebExtension/background.js`: orchestration, command handling, rule creation pipeline.
  - `WebExtension/dom.js`: field discovery and metadata extraction.
  - `WebExtension/generatorSuggestion.js`: generator intent and confidence selection logic.
  - `WebExtension/options/*`: settings UI and user configuration workflows.

## 2. Architecture Rules

- Do **not** introduce site-specific logic (no Eurorad-specific or single-site hacks).
- All behavior must be generic and reusable across websites.
- Generator suggestion must rely on semantic metadata:
  - `name`
  - `id`
  - `labelText`
  - `placeholder`
  - `nearbyText`
  - ARIA fields (`aria-label`, `aria-labelledby` text)
- Keep strict separation of concerns:
  - Extraction: `dom.js`
  - Suggestion/classification: `generatorSuggestion.js`
  - Execution/orchestration: `background.js`

## 3. Generator Engine Rules

- Do **not** weaken bulk mode globally.
- Do **not** accept all medium-confidence suggestions.
- Only promote suggestions when:
  - multiple signals agree, **or**
  - a strong semantic match exists.
- Safe generators for careful promotion:
  - `firstName`, `lastName`, `email`, `phone`, `city`, `postalCode`, `country`, address intents (`streetAddress1`, `streetAddress2`)
- Be conservative for:
  - `company`, `vatId`, `genericText`

## 4. Debugging Rules

- Use structured logs during debugging:
  - `GENERATOR_FIELD_SUMMARY`
  - `GENERATOR_SOURCES`
  - `GENERATOR_RAW_SUGGESTION`
  - `GENERATOR_FINAL_SUGGESTION`
- Never log full DOM objects.
- Keep logs compact and readable.

## 5. Xcode / Build Rules (CRITICAL)

- If JavaScript changes are not reflected at runtime:
  - verify built extension resources in DerivedData,
  - if mismatch persists, remove and re-add the affected file in Xcode target membership/resources.
- Always clean build before retesting:
  - `Shift + Cmd + K`
- After extension changes, restart Safari or toggle the extension off/on.

## 6. Git Workflow Rules (CRITICAL)

- Always work on feature branches.
- Never work directly on `main`.
- Before merging:
  - `git checkout main`
  - `git pull --rebase origin main`
- Then merge the feature branch.
- Commit `project.pbxproj` changes when they are part of the work (do **not** ignore them blindly).

## 7. What NOT to do

- No page-specific hacks.
- No hardcoded selectors for one site.
- No silent logic changes without logging support during debugging.
- No large refactors without a clear reason.
- Do not break already-working generator behavior (for example `email`, `phone`).

## 8. How to Approach Fixes

1. Add logs first.
2. Analyze real captured field data.
3. Identify the generic failure mode.
4. Apply the minimal safe fix.
5. Validate across multiple field types and page structures.
