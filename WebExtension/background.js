(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const BACKGROUND_LOG_PREFIX = "CHAOSFILL_BACKGROUND:";
  const debugLog = (...args) => console.log(BACKGROUND_LOG_PREFIX, ...args);
  const debugError = (...args) => console.error(BACKGROUND_LOG_PREFIX, ...args);

  debugLog("background.js loaded");
  console.log("CHAOSFILL_POPUP:", "No popup configured in manifest (toolbar uses onClicked handler).");

  const MENU_FILL_FIELD = "chaos-fill-fill-field";
  const MENU_FILL_FORM = "chaos-fill-fill-form";
  const MENU_ADD_FIELD_TO_CONFIG = "chaos-fill-add-field-to-config";
  const MENU_ADD_ALL_FIELDS_TO_CONFIG = "chaos-fill-add-all-fields-to-config";
  const MENU_OPEN_SETTINGS = "chaos-fill-open-settings";

  const runtimeSessions = new Map();
  // LEGACY GENERATOR SUGGESTION (DEPRECATED)
  // Previous inline keyword/regex generator assignment lived in this file.
  // It has been replaced by WebExtension/generatorSuggestion.js.

  function sessionKey(tabId, domain) {
    return `${tabId}:${domain}`;
  }

  function clearTabSessions(tabId) {
    const prefix = `${tabId}:`;
    for (const key of Array.from(runtimeSessions.keys())) {
      if (key.startsWith(prefix)) {
        runtimeSessions.delete(key);
      }
    }
  }

  function getSessionEntry(tabId, domain) {
    const key = sessionKey(tabId, domain);
    if (!runtimeSessions.has(key)) {
      runtimeSessions.set(key, {
        createdAt: Date.now(),
        values: {}
      });
    }
    return runtimeSessions.get(key);
  }

  function safeString(value) {
    return String(value || "").trim();
  }

  function shorten(value, max = 140) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  function fieldSummary(field) {
    return {
      name: shorten(field?.name),
      id: shorten(field?.id),
      type: shorten(field?.type),
      tagName: shorten(field?.tagName),
      labelText: shorten(field?.labelText),
      placeholder: shorten(field?.placeholder),
      nearbyText: shorten(field?.nearbyText),
      ariaLabel: shorten(field?.ariaLabel),
      ariaLabelledbyText: shorten(field?.ariaLabelledbyText)
    };
  }

  function extractHostname(urlLike) {
    const raw = safeString(urlLike);
    if (!raw) return "";

    try {
      const parsed = new URL(raw);
      return globalThis.ChaosFillStorage.normalizeDomain(parsed.hostname);
    } catch (_error) {
      return globalThis.ChaosFillStorage.normalizeDomain(raw);
    }
  }

  function resolveProfileHostnameForTab(tab, pageHostname) {
    const tabHostname = extractHostname(tab?.url || "");
    if (tabHostname) {
      return tabHostname;
    }
    return extractHostname(pageHostname || "");
  }

  function sendMessageToTab(tabId, message, frameId) {
    return new Promise((resolve) => {
      if (!tabId) {
        resolve({ ok: false, reason: "missing-tab" });
        return;
      }

      const callback = (response) => {
        const error = api.runtime.lastError;
        if (error) {
          debugError("tabs.sendMessage failed", { tabId, frameId, messageType: message?.type, error: error.message });
          resolve({ ok: false, reason: error.message });
          return;
        }
        debugLog("tabs.sendMessage response", { tabId, frameId, messageType: message?.type, response });
        resolve({ ok: true, response });
      };

      if (typeof frameId === "number") {
        api.tabs.sendMessage(tabId, message, { frameId }, callback);
      } else {
        api.tabs.sendMessage(tabId, message, callback);
      }
    });
  }

  async function refreshContextMenus() {
    debugLog("refreshContextMenus called");
    const state = await globalThis.ChaosFillStorage.getState();
    const settings = state.settings || {};

    return new Promise((resolve) => {
      api.contextMenus.removeAll(() => {
        api.contextMenus.create({
          id: MENU_OPEN_SETTINGS,
          title: "Open ChaosFill Settings",
          contexts: ["browser_action"]
        });

        if (settings.contextMenuEnabled === false) {
          debugLog("context menu disabled in settings");
          resolve();
          return;
        }

        api.contextMenus.create({
          id: MENU_FILL_FIELD,
          title: "Fill this field",
          contexts: ["all"]
        });

        api.contextMenus.create({
          id: MENU_FILL_FORM,
          title: "Fill this form",
          contexts: ["all"]
        });

        api.contextMenus.create({
          id: MENU_ADD_FIELD_TO_CONFIG,
          title: "Add this field to configuration",
          contexts: ["all"]
        });

        api.contextMenus.create({
          id: MENU_ADD_ALL_FIELDS_TO_CONFIG,
          title: "Add all editable fields to configuration",
          contexts: ["all"]
        });

        resolve();
      });
    });
  }

  function normalizeForMatch(value) {
    return safeString(value).replace(/\s+/g, " ");
  }

  function normalizeToken(value) {
    return safeString(value).toLowerCase().replace(/\s+/g, " ");
  }

  function isLikelyDynamicId(value) {
    const raw = safeString(value);
    if (!raw) return false;

    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
    const longHashLike = /^[a-z0-9_-]{20,}$/i.test(raw);
    const containsLongDigits = /\d{4,}/.test(raw);
    const mixed = /[a-z]/i.test(raw) && /\d/.test(raw);
    return uuidLike || longHashLike || (containsLongDigits && mixed);
  }

  function mapSuggestedIntentToRule(suggestedIntent) {
    const intent = safeString(suggestedIntent);
    switch (intent) {
      case "streetAddress1":
        return { generatorType: "street", resolvedKey: "streetAddress1", outputMask: "" };
      case "streetAddress2":
        return { generatorType: "street", resolvedKey: "streetAddress2", outputMask: "" };
      case "postalCode":
        return { generatorType: "zip", resolvedKey: "postalCode", outputMask: "" };
      case "genericText":
        return { generatorType: "lorem", resolvedKey: "genericText", outputMask: "" };
      case "date":
        return { generatorType: "date", resolvedKey: "date", outputMask: "" };
      case "vatId":
        return { generatorType: "vatId", resolvedKey: "vatId", outputMask: "DE#########" };
      case "firstName":
      case "lastName":
      case "fullName":
      case "company":
      case "email":
      case "phone":
      case "city":
      case "country":
      case "iban":
      case "bic":
      case "password":
        return { generatorType: intent, resolvedKey: intent, outputMask: "" };
      default:
        return { generatorType: "lorem", resolvedKey: "genericText", outputMask: "" };
    }
  }

  function suggestGeneratorForCapturedField(fieldMetadata, mode = "single") {
    const engine = globalThis.ChaosFillGeneratorSuggestion;
    console.log("GENERATOR_ENGINE", engine);
    if (!engine || typeof engine.suggestGeneratorForCapturedField !== "function") {
      return {
        generator: "genericText",
        confidence: "low",
        reason: "Suggestion engine unavailable"
      };
    }

    return engine.suggestGeneratorForCapturedField(fieldMetadata, mode);
  }

  function applyTypeFallbackToSuggestion(field, suggestion) {
    const suggested = suggestion && typeof suggestion === "object" ? suggestion : {
      generator: "genericText",
      confidence: "low",
      reason: "Missing suggestion"
    };

    if (suggested.generator !== "genericText") {
      return { ...suggested, fallbackApplied: false };
    }

    const type = safeString(field?.type).toLowerCase();
    const fallbackByType = {
      email: "email",
      tel: "phone",
      password: "password",
      date: "date",
      "datetime-local": "date"
    };
    const overrideGenerator = fallbackByType[type];
    if (!overrideGenerator) {
      return { ...suggested, fallbackApplied: false };
    }

    return {
      ...suggested,
      generator: overrideGenerator,
      confidence: suggested.confidence === "low" ? "medium" : suggested.confidence,
      reason: `${safeString(suggested.reason) || "genericText"}; type fallback '${type}' -> '${overrideGenerator}'`,
      fallbackApplied: true
    };
  }

  function pickRuleMatch(field) {
    const patterns = [];

    const id = safeString(field.id);
    if (id && !isLikelyDynamicId(id)) {
      patterns.push(`id:${id}`);
      const idNormalized = id
        .replace(/\d+/g, "")
        .replace(/[-_]{2,}/g, "_")
        .replace(/^[-_]+|[-_]+$/g, "");
      if (idNormalized && idNormalized.length >= 4 && idNormalized !== id) {
        patterns.push(`id:${idNormalized}`);
      }
    }

    const name = safeString(field.name);
    if (name) {
      patterns.push(`name:${name}`);
    }

    const placeholder = safeString(field.placeholder);
    if (placeholder) {
      patterns.push(`placeholder:${normalizeForMatch(placeholder)}`);
    }

    const label = safeString(field.labelText);
    if (label) {
      patterns.push(`label:${normalizeForMatch(label)}`);
    }

    const ariaLabel = safeString(field.ariaLabel);
    if (ariaLabel) {
      patterns.push(`ariaLabel:${normalizeForMatch(ariaLabel)}`);
    }

    const ariaLabelledby = safeString(field.ariaLabelledbyText);
    if (ariaLabelledby) {
      patterns.push(`ariaLabelledby:${normalizeForMatch(ariaLabelledby)}`);
    }

    if (patterns.length === 0) {
      return null;
    }

    return {
      target: "any",
      kind: "contains",
      pattern: patterns.join("; ")
    };
  }

  function buildRuleFromField(field, mode = "single") {
    const match = pickRuleMatch(field);
    if (!match) return null;

    console.log("GENERATOR_INPUT", { mode, field: fieldSummary(field) });
    const rawSuggestion = suggestGeneratorForCapturedField(field, mode);
    const suggestion = applyTypeFallbackToSuggestion(field, rawSuggestion);
    console.log("GENERATOR_OUTPUT", { mode, rawSuggestion, suggestion });
    const mappedSuggestion = mapSuggestedIntentToRule(suggestion.generator);
    console.log("GENERATOR_MAPPING", {
      mode,
      suggestedGenerator: suggestion.generator,
      mappedSuggestion
    });
    const titleSource = safeString(field.labelText)
      || safeString(field.name)
      || safeString(field.id)
      || safeString(field.placeholder)
      || "Field Rule";

    console.log("GENERATOR_SUGGESTION", {
      mode,
      field: fieldSummary(field),
      result: suggestion
    });

    return {
      id: globalThis.ChaosFillStorage.createRuleId(),
      title: `Field: ${titleSource.slice(0, 42)}`,
      generator: {
        type: mappedSuggestion.generatorType,
        items: []
      },
      match: {
        kind: match.kind,
        target: match.target,
        pattern: match.pattern
      },
      outputMask: mappedSuggestion.outputMask,
      resolvedKey: mappedSuggestion.resolvedKey,
      suggestionConfidence: suggestion.confidence,
      suggestionReason: suggestion.reason,
      suggestedGenerator: suggestion.generator,
      overrideEnabled: false,
      overrideValue: "",
      domainRegex: "",
      enabled: true
    };
  }

  function ruleSignature(rule) {
    return JSON.stringify({
      t: safeString(rule?.match?.target),
      k: safeString(rule?.match?.kind),
      p: safeString(rule?.match?.pattern),
      g: safeString(rule?.generator?.type),
      m: safeString(rule?.outputMask),
      d: safeString(rule?.domainRegex),
      r: safeString(rule?.resolvedKey),
      o: safeString(rule?.overrideValue)
    });
  }

  function splitRulePatternEntries(pattern) {
    return String(pattern || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function parsePatternEntry(rawEntry) {
    const raw = safeString(rawEntry);
    if (!raw) {
      return { target: "", pattern: "" };
    }

    const prefixed = raw.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*[:=]\s*(.+)$/);
    if (!prefixed) {
      return { target: "", pattern: raw };
    }

    return {
      target: normalizeToken(prefixed[1]),
      pattern: safeString(prefixed[2])
    };
  }

  function buildRuleIdentity(rule) {
    const generatorType = normalizeToken(rule?.generator?.type || "lorem");
    const resolvedKey = normalizeToken(rule?.resolvedKey || "");
    const fallbackTarget = normalizeToken(rule?.match?.target || "any");
    const entries = splitRulePatternEntries(rule?.match?.pattern)
      .map((entry) => parsePatternEntry(entry))
      .filter((entry) => entry.pattern);

    const stableTokens = [];
    for (const entry of entries) {
      const target = entry.target || fallbackTarget || "any";
      const pattern = normalizeToken(entry.pattern);
      if (!pattern) continue;
      if (target === "id" && isLikelyDynamicId(entry.pattern)) continue;
      stableTokens.push(`${target}:${pattern}`);
    }

    stableTokens.sort();
    if (stableTokens.length === 0) {
      return "";
    }

    return JSON.stringify({
      generatorType,
      resolvedKey,
      stableTokens
    });
  }

  function mergeRulePatterns(existingRule, candidateRule) {
    const fallbackTarget = safeString(existingRule?.match?.target || "any");
    const entries = [
      ...splitRulePatternEntries(existingRule?.match?.pattern),
      ...splitRulePatternEntries(candidateRule?.match?.pattern)
    ];

    const merged = [];
    const seen = new Set();

    for (const rawEntry of entries) {
      const parsed = parsePatternEntry(rawEntry);
      if (!parsed.pattern) continue;

      const target = parsed.target || normalizeToken(fallbackTarget) || "any";
      const pattern = normalizeToken(parsed.pattern);
      const dedupeKey = `${target}:${pattern}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (!parsed.target || target === normalizeToken(fallbackTarget)) {
        merged.push(parsed.pattern);
      } else {
        merged.push(`${parsed.target}:${parsed.pattern}`);
      }
    }

    return merged.join("; ");
  }

  async function appendDomainRulesAndOpenOptions(hostname, candidateRules) {
    debugLog("appendDomainRulesAndOpenOptions", { hostname, candidates: Array.isArray(candidateRules) ? candidateRules.length : 0 });
    const domainKey = extractHostname(hostname);
    const profile = await globalThis.ChaosFillStorage.getOrCreateDomainProfile(domainKey);
    if (!profile) {
      await openOptionsPage();
      return;
    }

    const existingRules = Array.isArray(profile.rules) ? profile.rules : [];
    const existingSignatures = new Set(existingRules.map((rule) => ruleSignature(rule)));
    const identityToIndex = new Map();
    existingRules.forEach((rule, index) => {
      const identity = buildRuleIdentity(rule);
      if (!identity) return;
      if (!identityToIndex.has(identity)) {
        identityToIndex.set(identity, index);
      }
    });

    const newRules = [];
    let hasUpdatedExistingRule = false;
    for (const candidate of candidateRules) {
      if (!candidate) continue;

      const signature = ruleSignature(candidate);
      if (existingSignatures.has(signature)) continue;

      const identity = buildRuleIdentity(candidate);
      if (identity && identityToIndex.has(identity)) {
        const index = identityToIndex.get(identity);
        const existing = existingRules[index];
        existing.match = existing.match || {};
        existing.match.pattern = mergeRulePatterns(existing, candidate);

        if (!safeString(existing.resolvedKey) && safeString(candidate.resolvedKey)) {
          existing.resolvedKey = candidate.resolvedKey;
        }
        if (!safeString(existing.outputMask) && safeString(candidate.outputMask)) {
          existing.outputMask = candidate.outputMask;
        }
        existing.enabled = true;

        hasUpdatedExistingRule = true;
        existingSignatures.add(ruleSignature(existing));
        continue;
      }

      existingSignatures.add(signature);
      newRules.push(candidate);
      if (identity) {
        identityToIndex.set(identity, existingRules.length + newRules.length - 1);
      }
    }

    const needsEnable = profile.enabled === false;

    if (newRules.length > 0 || needsEnable || hasUpdatedExistingRule) {
      if (newRules.length > 0) {
        profile.rules = [...newRules, ...existingRules];
      } else {
        profile.rules = existingRules;
      }
      profile.enabled = true;
      profile.updatedAt = Date.now();
      await globalThis.ChaosFillStorage.saveDomainProfile(profile);
      debugLog("domain profile saved after add/update", {
        domainKey,
        newRules: newRules.length,
        updatedExisting: hasUpdatedExistingRule,
        enabled: profile.enabled
      });
    }

    await openOptionsPage();
  }

  function openOptionsPage() {
    return new Promise((resolve) => {
      api.runtime.openOptionsPage(() => {
        resolve();
      });
    });
  }

  async function ensureConfigForTab(tab) {
    const hostname = extractHostname(tab?.url || "");
    return globalThis.ChaosFillStorage.getEffectiveDomainConfig(hostname);
  }

  async function runFillCommand(tab, frameId, type) {
    if (!tab?.id) return;
    debugLog("runFillCommand start", { type, tabId: tab.id, frameId, tabUrl: tab.url });

    const config = await ensureConfigForTab(tab);
    const hostname = config?.domain?.id || extractHostname(tab.url || "");
    if (config?.domain && config.domain.enabled === false) {
      debugLog("runFillCommand skipped: domain disabled", { domain: hostname });
      return;
    }

    const safeUrl = safeString(tab.url) || (hostname ? `https://${hostname}/` : globalThis.location?.href || "https://example.com/");
    const blocked = globalThis.ChaosFillRules.isDomainBlocked(safeUrl, config.settings);
    if (blocked.blocked) {
      debugLog("runFillCommand skipped: domain blocked", { safeUrl, blocked });
      return;
    }

    const session = getSessionEntry(tab.id, hostname || "unknown");
    const result = await sendMessageToTab(tab.id, {
      type,
      tabId: tab.id,
      domain: hostname,
      pageUrl: safeUrl,
      config,
      sessionValues: session.values
    }, frameId);

    if (result.ok && result.response?.sessionValues && typeof result.response.sessionValues === "object") {
      session.values = result.response.sessionValues;
    }

    debugLog("runFillCommand finished", {
      type,
      tabId: tab.id,
      domain: hostname,
      ok: result.ok,
      reason: result.reason || null,
      response: result.response || null
    });
  }

  async function addContextFieldToConfiguration(tab, frameId) {
    const result = await sendMessageToTab(tab.id, { type: "CHAOS_FILL_CAPTURE_CONTEXT_FIELD" }, frameId);
    if (!result.ok || !result.response?.ok || !result.response?.field) {
      return;
    }

    const newRule = buildRuleFromField(result.response.field, "single");
    const hostname = resolveProfileHostnameForTab(tab, result.response?.page?.hostname);
    await appendDomainRulesAndOpenOptions(hostname, [newRule]);
  }

  async function addAllPageFieldsToConfiguration(tab, frameId) {
    const result = await sendMessageToTab(tab.id, { type: "CHAOS_FILL_CAPTURE_PAGE_FIELDS" }, frameId);
    if (!result.ok || !result.response?.ok || !Array.isArray(result.response?.fields)) {
      return;
    }

    const rules = result.response.fields.map((field) => buildRuleFromField(field, "bulk")).filter(Boolean);
    const hostname = resolveProfileHostnameForTab(tab, result.response?.page?.hostname);
    await appendDomainRulesAndOpenOptions(hostname, rules);
  }

  function registerToolbarClickHandler() {
    if (api.action?.onClicked) {
      api.action.onClicked.addListener((tab) => {
        debugLog("toolbar action clicked", { tabId: tab?.id, tabUrl: tab?.url });
        runFillCommand(tab, null, "CHAOS_FILL_FILL_BEST_FORM");
      });
      return;
    }

    if (api.browserAction?.onClicked) {
      api.browserAction.onClicked.addListener((tab) => {
        debugLog("browserAction clicked", { tabId: tab?.id, tabUrl: tab?.url });
        runFillCommand(tab, null, "CHAOS_FILL_FILL_BEST_FORM");
      });
    }
  }

  api.runtime.onInstalled.addListener(() => {
    debugLog("runtime.onInstalled");
    refreshContextMenus();
  });

  if (api.runtime.onStartup) {
    api.runtime.onStartup.addListener(() => {
      debugLog("runtime.onStartup");
      refreshContextMenus();
    });
  }

  if (api.tabs?.onRemoved) {
    api.tabs.onRemoved.addListener((tabId) => {
      clearTabSessions(tabId);
    });
  }

  if (api.tabs?.onUpdated) {
    api.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo?.status === "loading") {
        clearTabSessions(tabId);
      }
    });
  }

  registerToolbarClickHandler();
  debugLog("Toolbar click handler registered");

  api.contextMenus.onClicked.addListener((info, tab) => {
    debugLog("contextMenus.onClicked", { menuItemId: info.menuItemId, frameId: info.frameId, tabId: tab?.id, tabUrl: tab?.url });

    if (info.menuItemId === MENU_OPEN_SETTINGS) {
      openOptionsPage();
      return;
    }

    if (!tab?.id) return;

    if (info.menuItemId === MENU_FILL_FIELD) {
      runFillCommand(tab, info.frameId, "CHAOS_FILL_FILL_CONTEXT_FIELD");
      return;
    }

    if (info.menuItemId === MENU_FILL_FORM) {
      runFillCommand(tab, info.frameId, "CHAOS_FILL_FILL_CONTEXT_FORM");
      return;
    }

    if (info.menuItemId === MENU_ADD_FIELD_TO_CONFIG) {
      addContextFieldToConfiguration(tab, info.frameId);
      return;
    }

    if (info.menuItemId === MENU_ADD_ALL_FIELDS_TO_CONFIG) {
      addAllPageFieldsToConfiguration(tab, info.frameId);
    }
  });

  api.runtime.onMessage.addListener((message) => {
    debugLog("runtime.onMessage", message);
    if (message?.type === "CHAOS_FILL_SETTINGS_UPDATED") {
      refreshContextMenus();
    }

    if (message?.type === "CHAOS_FILL_RESET_SESSION" && Number.isFinite(Number(message.tabId))) {
      clearTabSessions(Number(message.tabId));
    }
  });
  debugLog("runtime.onMessage listener registered");
})();
