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

  const runtimeSessions = new Map();

  const VAT_HINT_REGEX = /\b(vat|ust|uid|sales[\s._-]*tax|tax[\s._-]*(id|number))\b/i;
  const EMAIL_HINT_REGEX = /\b(e[\s._-]*mail)\b/i;
  const PHONE_HINT_REGEX = /\b(phone|mobile|tel|telephone)\b/i;
  const NUMBER_HINT_REGEX = /\b(number|amount|qty|quantity|count|age)\b/i;
  const COMPANY_HINT_REGEX = /\b(company|organisation|organization|business|firm)\b/i;
  const STREET_HINT_REGEX = /\b(street|address|addr|line\s*1|line\s*2)\b/i;
  const CITY_HINT_REGEX = /\b(city|town)\b/i;
  const ZIP_HINT_REGEX = /\b(zip|postal|postcode|post[\s._-]*code)\b/i;
  const COUNTRY_HINT_REGEX = /\b(country|nation)\b/i;
  const IBAN_HINT_REGEX = /\b(iban|account[\s._-]*number|bank[\s._-]*account)\b/i;
  const BIC_HINT_REGEX = /\b(bic|swift)\b/i;
  const FIRST_NAME_HINT_REGEX = /\b(first[\s._-]*name|given[\s._-]*name|forename)\b/i;
  const LAST_NAME_HINT_REGEX = /\b(last[\s._-]*name|family[\s._-]*name|surname)\b/i;
  const FULL_NAME_HINT_REGEX = /\b(full[\s._-]*name|name)\b/i;

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

  function normalizeForHint(value) {
    return safeString(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[._[\](){}-]+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function buildFieldHintText(field) {
    return [
      field.id,
      field.name,
      field.placeholder,
      field.labelText,
      field.ariaLabel,
      field.ariaLabelledbyText
    ]
      .map((part) => normalizeForHint(part))
      .filter(Boolean)
      .join(" ");
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

  function guessGenerator(field) {
    const searchText = buildFieldHintText(field);

    const fieldType = safeString(field.type).toLowerCase();
    const tagName = safeString(field.tagName).toLowerCase();

    if (VAT_HINT_REGEX.test(searchText)) return { type: "vatId", outputMask: "DE#########", resolvedKey: "vatId" };
    if (fieldType === "email" || EMAIL_HINT_REGEX.test(searchText)) return { type: "email", outputMask: "", resolvedKey: "email" };
    if (fieldType === "tel" || PHONE_HINT_REGEX.test(searchText)) return { type: "phone", outputMask: "", resolvedKey: "phone" };
    if (fieldType === "number" || NUMBER_HINT_REGEX.test(searchText)) return { type: "number", outputMask: "", resolvedKey: "number" };
    if (fieldType === "date") return { type: "date", outputMask: "", resolvedKey: "date" };
    if (fieldType === "datetime-local") return { type: "datetime-local", outputMask: "", resolvedKey: "datetime-local" };
    if (fieldType === "password" || /\b(password|passcode)\b/.test(searchText)) return { type: "password", outputMask: "", resolvedKey: "password" };
    if (IBAN_HINT_REGEX.test(searchText)) return { type: "iban", outputMask: "", resolvedKey: "iban" };
    if (BIC_HINT_REGEX.test(searchText)) return { type: "bic", outputMask: "", resolvedKey: "bic" };
    if (FIRST_NAME_HINT_REGEX.test(searchText)) return { type: "firstName", outputMask: "", resolvedKey: "firstName" };
    if (LAST_NAME_HINT_REGEX.test(searchText)) return { type: "lastName", outputMask: "", resolvedKey: "lastName" };
    if (COMPANY_HINT_REGEX.test(searchText)) return { type: "company", outputMask: "", resolvedKey: "company" };
    if (STREET_HINT_REGEX.test(searchText)) return { type: "street", outputMask: "", resolvedKey: "street" };
    if (CITY_HINT_REGEX.test(searchText)) return { type: "city", outputMask: "", resolvedKey: "city" };
    if (ZIP_HINT_REGEX.test(searchText)) return { type: "zip", outputMask: "", resolvedKey: "zip" };
    if (COUNTRY_HINT_REGEX.test(searchText)) return { type: "country", outputMask: "", resolvedKey: "country" };
    if (FULL_NAME_HINT_REGEX.test(searchText)) return { type: "fullName", outputMask: "", resolvedKey: "fullName" };
    if (tagName === "textarea") return { type: "lorem", outputMask: "", resolvedKey: "lorem" };

    return { type: "lorem", outputMask: "", resolvedKey: "lorem" };
  }

  function buildRuleFromField(field) {
    const match = pickRuleMatch(field);
    if (!match) return null;

    const generatorInfo = guessGenerator(field);
    const titleSource = safeString(field.labelText)
      || safeString(field.name)
      || safeString(field.id)
      || safeString(field.placeholder)
      || "Field Rule";

    return {
      id: globalThis.ChaosFillStorage.createRuleId(),
      title: `Field: ${titleSource.slice(0, 42)}`,
      generator: {
        type: generatorInfo.type,
        items: []
      },
      match: {
        kind: match.kind,
        target: match.target,
        pattern: match.pattern
      },
      outputMask: generatorInfo.outputMask,
      resolvedKey: generatorInfo.resolvedKey,
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

    const newRule = buildRuleFromField(result.response.field);
    const hostname = resolveProfileHostnameForTab(tab, result.response?.page?.hostname);
    await appendDomainRulesAndOpenOptions(hostname, [newRule]);
  }

  async function addAllPageFieldsToConfiguration(tab, frameId) {
    const result = await sendMessageToTab(tab.id, { type: "CHAOS_FILL_CAPTURE_PAGE_FIELDS" }, frameId);
    if (!result.ok || !result.response?.ok || !Array.isArray(result.response?.fields)) {
      return;
    }

    const rules = result.response.fields.map((field) => buildRuleFromField(field)).filter(Boolean);
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
    if (!tab?.id) return;
    debugLog("contextMenus.onClicked", { menuItemId: info.menuItemId, frameId: info.frameId, tabId: tab.id, tabUrl: tab.url });

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
