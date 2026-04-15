# WORKLOG

## Current Context
- Branch: main
- Task: Fully fix disabled field rules still allowing autofill in some runtime paths.
- Status: Completed; precedence bug fixed and fill-pipeline logging added.

## Scope
- Files in scope: `WebExtension/storage.js`, `WebExtension/rules.js`, `WebExtension/fill.js`, `tests/disabled-rules.test.js`, `tests/storage-effective-config.test.js`, `WORKLOG.md`
- Files explicitly out of scope: `WebExtension/options/*`, `WebExtension/background.js`, `WebExtension/content.js`, generator logic, Xcode project settings, settings UI design

## Recent Changes
- Added `STORAGE_RULE_STATE` logs on save and effective-config load with compact rule summaries including `enabled`, generator, resolved key, and match data.
- Added `RULE_CANDIDATES_BEFORE_FILTER`, `RULE_CANDIDATES_AFTER_FILTER`, `DISABLED_RULE_SKIPPED`, `RULE_MATCH_DECISION`, and `FIELD_FILL_DECISION` logs in the runtime fill pipeline.
- Replaced the split enabled/disabled resolution path with one ordered candidate list so a higher-priority disabled rule blocks lower-priority enabled matches.
- Added regression coverage for the remaining bug where a disabled domain rule still lost to an enabled global rule.
- Added storage coverage proving `enabled=false` survives save/load and `getEffectiveDomainConfig`.

## Known Issues / Observations
- `options.js` and `storage.js` persist `enabled=false` correctly.
- The remaining bug was in `WebExtension/rules.js` `resolveGenerator()`: it chose any enabled match before considering disabled matches, so a disabled domain rule could be bypassed by a lower-priority enabled global rule.
- Manual Safari/Xcode validation is still pending in this session.

## Decisions Made
- Kept the fix in the shared matcher instead of duplicating enabled checks in multiple fill entry points.
- Disabled rules still do not generate values directly, but the highest-priority disabled candidate now blocks fill when it outranks lower-priority enabled candidates.

## Next Steps
- Validate in Safari with clean rebuild and extension reload for best-form and context-field/form commands.
- Commit the matcher fix, storage/fill logs, tests, and WORKLOG update together once Safari validation is complete.

## Validation Checklist
- [x] Bug reproduced in automated test before the fix
- [x] Automated regression: disabled rule blocks inference/fallback
- [x] Automated regression: disabled domain rule blocks lower-priority enabled global rule
- [x] Automated regression: enabled rule still fills
- [x] Storage test: `enabled=false` survives `saveState()` and `getEffectiveDomainConfig()`
- [x] Syntax checks: `node --check WebExtension/rules.js`, `node --check WebExtension/fill.js`, `node --check WebExtension/storage.js`
- [ ] Tested in real Safari extension
- [ ] Clean Xcode rebuild and extension reload completed

## Environment Notes
- Extension reload steps: clean build, rebuild, then restart Safari or toggle the extension after JS changes.
- Storage logs appear where `getEffectiveDomainConfig()` / `saveState()` run; field candidate and fill decision logs appear in the actual rule/fill pipeline.

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
