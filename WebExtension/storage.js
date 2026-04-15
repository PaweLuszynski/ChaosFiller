(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const STORAGE_LOG_PREFIX = "CHAOSFILL_STORAGE:";

  const STORAGE_KEY = "settings";
  const CURRENT_SETTINGS_VERSION = 7;

  const RULE_MATCH_TARGETS = [
    "any",
    "id",
    "name",
    "type",
    "placeholder",
    "label",
    "ariaLabel",
    "ariaLabelledby",
    "class"
  ];

  const DOMAIN_DATA_MODES = ["inherit", "random", "session", "persona"];
  const EFFECTIVE_DATA_MODES = ["random", "session", "persona"];

  const DEFAULT_GLOBAL_RULES = [
    {
      id: "rule-first-name",
      title: "First Name",
      generator: { type: "firstName" },
      match: { kind: "contains", pattern: "first name", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "firstName",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-last-name",
      title: "Last Name",
      generator: { type: "lastName" },
      match: { kind: "regex", pattern: "(last|family|sur)\\s*name", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "lastName",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-full-name",
      title: "Full Name",
      generator: { type: "fullName" },
      match: { kind: "contains", pattern: "full name", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "fullName",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-email",
      title: "Email",
      generator: { type: "email" },
      match: { kind: "contains", pattern: "email", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "email",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-phone",
      title: "Phone",
      generator: { type: "phone" },
      match: { kind: "regex", pattern: "(phone|mobile|tel)", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "phone",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-company",
      title: "Company",
      generator: { type: "company" },
      match: { kind: "contains", pattern: "company", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "company",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-iban",
      title: "IBAN",
      generator: { type: "iban" },
      match: { kind: "contains", pattern: "iban", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "iban",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-bic",
      title: "BIC/SWIFT",
      generator: { type: "bic" },
      match: { kind: "regex", pattern: "(bic|swift)", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "bic",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-vat",
      title: "VAT ID",
      generator: { type: "vatId" },
      match: {
        kind: "regex",
        pattern: "(vat|ust\\s*-?idnr|uid|sales.*tax(?:.*(id|number))?|tax\\s*(id|number)|vendor\\.salestaxid|company\\.salestaxid)",
        target: "any"
      },
      outputMask: "DE#########",
      domainRegex: "",
      resolvedKey: "vatId",
      overrideValue: "",
      enabled: true
    },
    {
      id: "rule-password",
      title: "Password",
      generator: { type: "password" },
      match: { kind: "contains", pattern: "password", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "password",
      overrideValue: "",
      enabled: true
    }
  ];

  const DEFAULT_SETTINGS = {
    dataMode: "random",
    personaFallbackToGenerated: true,
    triggerEvents: true,
    contextMenuEnabled: true,
    ignoreHiddenInvisible: true,
    ignoreExistingContent: false,
    ignoreMatchTokens: ["captcha", "hipinputtext"],
    confirmationTokens: ["confirm", "reenter", "retype", "repeat", "secondary"],
    agreeTokens: ["agree", "terms", "conditions"],
    ignoredDomains: [],
    sensitiveDenylistEnabled: true,
    debugMatching: false,
    useAttributes: {
      id: true,
      name: true,
      label: true,
      ariaLabel: true,
      ariaLabelledby: true,
      placeholder: true,
      class: false,
      type: true
    },
    password: {
      mode: "fixed",
      fixedValue: "P@$$w0rd!",
      randomLength: 16
    },
    fallback: {
      maxLength: 20,
      loremMaxWords: 6,
      emailDomain: "example.com",
      phoneFormat: "+49###########",
      dateStart: "1970-01-01",
      dateEnd: "2030-12-31",
      checkboxDefault: "random",
      radioStrategy: "random"
    }
  };

  const DEFAULT_STATE = {
    version: CURRENT_SETTINGS_VERSION,
    settings: DEFAULT_SETTINGS,
    globalRules: DEFAULT_GLOBAL_RULES,
    domains: {}
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeDefaults(target, defaults) {
    if (Array.isArray(defaults)) {
      return Array.isArray(target) ? target : clone(defaults);
    }

    if (defaults && typeof defaults === "object") {
      const output = {};
      const source = target && typeof target === "object" ? target : {};
      const keys = new Set([...Object.keys(defaults), ...Object.keys(source)]);
      for (const key of keys) {
        output[key] = mergeDefaults(source[key], defaults[key]);
      }
      return output;
    }

    return target === undefined ? defaults : target;
  }

  function createRuleId() {
    return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function safeString(value) {
    return String(value || "").trim();
  }

  function shorten(value, max = 80) {
    const text = safeString(value).replace(/\s+/g, " ");
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }

  function summarizeRuleForLog(rule, scope, context = {}) {
    return {
      scope,
      domain: context.domain || "",
      id: safeString(rule?.id),
      enabled: rule?.enabled !== false,
      generatorType: safeString(rule?.generator?.type || "lorem"),
      resolvedKey: safeString(rule?.resolvedKey),
      matchKind: safeString(rule?.match?.kind || "contains"),
      matchTarget: safeString(rule?.match?.target || "any"),
      matchPattern: shorten(rule?.match?.pattern)
    };
  }

  function logRuleState(phase, payload) {
    console.log(STORAGE_LOG_PREFIX, `STORAGE_RULE_STATE ${JSON.stringify({ phase, ...payload })}`);
  }

  function splitTokenList(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function normalizeDomain(hostname) {
    const raw = safeString(hostname)
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .toLowerCase();

    const withoutWww = raw.startsWith("www.") ? raw.slice(4) : raw;
    return withoutWww;
  }

  function normalizeTokenArray(value, fallback) {
    if (Array.isArray(value)) {
      return value
        .map((token) => safeString(token))
        .filter(Boolean);
    }
    return clone(fallback);
  }

  function normalizeEmailDomain(value) {
    const normalized = safeString(value)
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/^@+/, "");

    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
      return normalized;
    }

    return "example.com";
  }

  function normalizeRule(rule, index) {
    const safeRule = rule && typeof rule === "object" ? rule : {};
    const match = safeRule.match && typeof safeRule.match === "object" ? safeRule.match : {};
    const generator = safeRule.generator && typeof safeRule.generator === "object"
      ? safeRule.generator
      : { type: "lorem", items: [] };

    return {
      id: safeString(safeRule.id) || createRuleId(),
      title: safeString(safeRule.title) || `Rule ${index + 1}`,
      generator: {
        type: safeString(generator.type) || "lorem",
        items: Array.isArray(generator.items)
          ? generator.items.map((item) => safeString(item)).filter(Boolean)
          : []
      },
      match: {
        kind: ["contains", "equals", "regex"].includes(match.kind) ? match.kind : "contains",
        pattern: safeString(match.pattern),
        target: RULE_MATCH_TARGETS.includes(match.target) ? match.target : "any"
      },
      outputMask: typeof safeRule.outputMask === "string" ? safeRule.outputMask : "",
      domainRegex: typeof safeRule.domainRegex === "string" ? safeRule.domainRegex : "",
      resolvedKey: safeString(safeRule.resolvedKey),
      suggestionConfidence: ["high", "medium", "low"].includes(safeString(safeRule.suggestionConfidence).toLowerCase())
        ? safeString(safeRule.suggestionConfidence).toLowerCase()
        : "",
      suggestionReason: typeof safeRule.suggestionReason === "string" ? safeRule.suggestionReason : "",
      suggestedGenerator: typeof safeRule.suggestedGenerator === "string" ? safeRule.suggestedGenerator : "",
      overrideEnabled: typeof safeRule.overrideEnabled === "boolean"
        ? safeRule.overrideEnabled
        : (typeof safeRule.overrideValue === "string" && safeRule.overrideValue.length > 0),
      overrideValue: typeof safeRule.overrideValue === "string" ? safeRule.overrideValue : "",
      enabled: safeRule.enabled !== false
    };
  }

  function normalizeFixedValues(value) {
    const safe = value && typeof value === "object" ? value : {};
    const out = {};
    for (const [key, raw] of Object.entries(safe)) {
      const normalizedKey = safeString(key);
      if (!normalizedKey) continue;
      out[normalizedKey] = String(raw ?? "");
    }
    return out;
  }

  function normalizeDomainProfile(domainKey, profile) {
    const now = Date.now();
    const safeProfile = profile && typeof profile === "object" ? profile : {};
    const normalizedDomain = normalizeDomain(domainKey || safeProfile.id || safeProfile.label);

    return {
      id: normalizedDomain,
      label: safeString(safeProfile.label) || normalizedDomain,
      enabled: safeProfile.enabled !== false,
      createdAt: Number.isFinite(Number(safeProfile.createdAt)) ? Number(safeProfile.createdAt) : now,
      updatedAt: Number.isFinite(Number(safeProfile.updatedAt)) ? Number(safeProfile.updatedAt) : now,
      dataMode: DOMAIN_DATA_MODES.includes(safeProfile.dataMode) ? safeProfile.dataMode : "inherit",
      rules: Array.isArray(safeProfile.rules)
        ? safeProfile.rules.map((rule, index) => normalizeRule(rule, index))
        : [],
      fixedValues: normalizeFixedValues(safeProfile.fixedValues),
      ignoreTokens: normalizeTokenArray(safeProfile.ignoreTokens, []),
      notes: typeof safeProfile.notes === "string" ? safeProfile.notes : ""
    };
  }

  function normalizeSettings(input) {
    const merged = mergeDefaults(input, DEFAULT_SETTINGS);

    merged.dataMode = EFFECTIVE_DATA_MODES.includes(merged.dataMode) ? merged.dataMode : "random";
    merged.personaFallbackToGenerated = merged.personaFallbackToGenerated !== false;
    merged.triggerEvents = merged.triggerEvents !== false;
    merged.contextMenuEnabled = merged.contextMenuEnabled !== false;
    merged.ignoreHiddenInvisible = merged.ignoreHiddenInvisible !== false;
    merged.ignoreExistingContent = merged.ignoreExistingContent === true;
    merged.sensitiveDenylistEnabled = merged.sensitiveDenylistEnabled !== false;
    merged.debugMatching = merged.debugMatching === true;

    merged.ignoreMatchTokens = normalizeTokenArray(merged.ignoreMatchTokens, DEFAULT_SETTINGS.ignoreMatchTokens);
    merged.confirmationTokens = normalizeTokenArray(merged.confirmationTokens, DEFAULT_SETTINGS.confirmationTokens);
    merged.agreeTokens = normalizeTokenArray(merged.agreeTokens, DEFAULT_SETTINGS.agreeTokens);
    merged.ignoredDomains = normalizeTokenArray(merged.ignoredDomains, []);

    const attrs = merged.useAttributes && typeof merged.useAttributes === "object" ? merged.useAttributes : {};
    merged.useAttributes = {
      id: attrs.id !== false,
      name: attrs.name !== false,
      label: attrs.label !== false,
      ariaLabel: attrs.ariaLabel !== false,
      ariaLabelledby: attrs.ariaLabelledby !== false,
      placeholder: attrs.placeholder !== false,
      class: attrs.class === true,
      type: attrs.type !== false
    };

    merged.password.mode = merged.password.mode === "random" ? "random" : "fixed";
    merged.password.fixedValue = String(merged.password.fixedValue ?? "P@$$w0rd!");
    merged.password.randomLength = Number.isFinite(Number(merged.password.randomLength))
      ? Math.max(4, Math.min(128, Number(merged.password.randomLength)))
      : 16;

    merged.fallback.maxLength = Number.isFinite(Number(merged.fallback.maxLength))
      ? Math.max(1, Math.min(1024, Number(merged.fallback.maxLength)))
      : 20;
    merged.fallback.loremMaxWords = Number.isFinite(Number(merged.fallback.loremMaxWords))
      ? Math.max(1, Math.min(100, Number(merged.fallback.loremMaxWords)))
      : 6;
    merged.fallback.emailDomain = normalizeEmailDomain(merged.fallback.emailDomain);
    merged.fallback.phoneFormat = String(merged.fallback.phoneFormat || "+49###########");
    merged.fallback.dateStart = safeString(merged.fallback.dateStart || "1970-01-01");
    merged.fallback.dateEnd = safeString(merged.fallback.dateEnd || "2030-12-31");
    merged.fallback.checkboxDefault = ["random", "checked", "unchecked"].includes(merged.fallback.checkboxDefault)
      ? merged.fallback.checkboxDefault
      : "random";
    merged.fallback.radioStrategy = ["random", "firstEnabled"].includes(merged.fallback.radioStrategy)
      ? merged.fallback.radioStrategy
      : "random";

    return merged;
  }

  function migrateLegacyState(raw) {
    const safeRaw = raw && typeof raw === "object" ? clone(raw) : {};

    if (safeRaw.settings && Array.isArray(safeRaw.globalRules)) {
      return safeRaw;
    }

    const maybeLegacyRules = Array.isArray(safeRaw.rules) ? safeRaw.rules : [];
    const legacyGeneral = safeRaw.general && typeof safeRaw.general === "object" ? safeRaw.general : {};

    const migrated = {
      version: CURRENT_SETTINGS_VERSION,
      settings: {
        ...clone(DEFAULT_SETTINGS),
        dataMode: "random",
        triggerEvents: legacyGeneral.triggerEvents,
        contextMenuEnabled: legacyGeneral.contextMenuEnabled,
        ignoreHiddenInvisible: legacyGeneral.ignoreHiddenInvisible,
        ignoreExistingContent: legacyGeneral.ignoreExistingContent,
        ignoreMatchTokens: legacyGeneral.ignoreMatchTokens,
        confirmationTokens: legacyGeneral.confirmationTokens,
        agreeTokens: legacyGeneral.agreeTokens,
        ignoredDomains: legacyGeneral.ignoredDomains,
        sensitiveDenylistEnabled: legacyGeneral.enableSensitiveDenylist,
        useAttributes: legacyGeneral.useAttributes,
        password: safeRaw.password,
        fallback: safeRaw.fallback
      },
      globalRules: maybeLegacyRules,
      domains: {}
    };

    return migrated;
  }

  function normalizeState(raw) {
    const migrated = migrateLegacyState(raw);
    const merged = mergeDefaults(migrated, DEFAULT_STATE);

    const state = {
      version: CURRENT_SETTINGS_VERSION,
      settings: normalizeSettings(merged.settings),
      globalRules: Array.isArray(merged.globalRules)
        ? merged.globalRules.map((rule, index) => normalizeRule(rule, index))
        : clone(DEFAULT_GLOBAL_RULES),
      domains: {}
    };

    const rawDomains = merged.domains && typeof merged.domains === "object" ? merged.domains : {};
    for (const [domainKey, profile] of Object.entries(rawDomains)) {
      const normalizedDomain = normalizeDomain(domainKey);
      if (!normalizedDomain) continue;
      state.domains[normalizedDomain] = normalizeDomainProfile(normalizedDomain, profile);
    }

    return state;
  }

  async function getLocal(key) {
    const result = await api.storage.local.get(key);
    return result?.[key];
  }

  async function setLocal(value) {
    await api.storage.local.set(value);
  }

  function ensureDomainProfileInState(state, hostname) {
    const domainKey = normalizeDomain(hostname);
    if (!domainKey) {
      return { state, domainKey: "", profile: null, created: false };
    }

    if (state.domains[domainKey]) {
      return {
        state,
        domainKey,
        profile: state.domains[domainKey],
        created: false
      };
    }

    const now = Date.now();
    const profile = normalizeDomainProfile(domainKey, {
      id: domainKey,
      label: domainKey,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      dataMode: "inherit",
      rules: [],
      fixedValues: {},
      ignoreTokens: [],
      notes: ""
    });

    const nextState = clone(state);
    nextState.domains[domainKey] = profile;

    return {
      state: nextState,
      domainKey,
      profile,
      created: true
    };
  }

  async function getState() {
    const raw = await getLocal(STORAGE_KEY);
    const normalized = normalizeState(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await setLocal({ [STORAGE_KEY]: normalized });
    }
    return normalized;
  }

  async function saveState(state) {
    const normalized = normalizeState(state);
    logRuleState("save-state", {
      globalRules: normalized.globalRules.map((rule) => summarizeRuleForLog(rule, "global")),
      domains: Object.values(normalized.domains || {}).map((profile) => ({
        domain: profile.id,
        enabled: profile.enabled !== false,
        rules: (profile.rules || []).map((rule) => summarizeRuleForLog(rule, "domain", { domain: profile.id }))
      }))
    });
    await setLocal({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function resetState() {
    const defaults = normalizeState(DEFAULT_STATE);
    await setLocal({ [STORAGE_KEY]: defaults });
    return defaults;
  }

  async function getOrCreateDomainProfile(hostname) {
    const state = await getState();
    const ensured = ensureDomainProfileInState(state, hostname);
    if (!ensured.profile) return null;
    if (ensured.created) {
      await saveState(ensured.state);
    }
    return clone(ensured.profile);
  }

  async function hasDomainProfile(hostname) {
    const state = await getState();
    const domainKey = normalizeDomain(hostname);
    if (!domainKey) return false;
    return Boolean(state.domains?.[domainKey]);
  }

  async function saveDomainProfile(profile) {
    const state = await getState();
    const domainKey = normalizeDomain(profile?.id || profile?.label);
    if (!domainKey) {
      throw new Error("Domain profile id is required.");
    }

    const existing = state.domains[domainKey] || {};
    const normalized = normalizeDomainProfile(domainKey, {
      ...existing,
      ...profile,
      id: domainKey,
      updatedAt: Date.now()
    });

    state.domains[domainKey] = normalized;
    await saveState(state);
    return clone(normalized);
  }

  async function removeDomainProfile(hostname) {
    const state = await getState();
    const domainKey = normalizeDomain(hostname);
    if (!domainKey || !state.domains?.[domainKey]) {
      return false;
    }

    delete state.domains[domainKey];
    await saveState(state);
    return true;
  }

  async function listDomainsSorted() {
    const state = await getState();
    return Object.values(state.domains)
      .map((profile) => clone(profile))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async function getEffectiveDomainConfig(hostname) {
    const state = await getState();
    const ensured = ensureDomainProfileInState(state, hostname);

    let sourceState = state;
    if (ensured.created) {
      sourceState = await saveState(ensured.state);
    }

    const profile = sourceState.domains[ensured.domainKey] || null;
    if (!profile) {
      return {
        domain: null,
        settings: clone(sourceState.settings),
        globalRules: clone(sourceState.globalRules),
        domainRules: [],
        fixedValues: {},
        dataMode: sourceState.settings.dataMode
      };
    }

    const dataMode = profile.dataMode && profile.dataMode !== "inherit"
      ? profile.dataMode
      : sourceState.settings.dataMode;

    logRuleState("load-effective-config", {
      hostname: normalizeDomain(hostname),
      domain: {
        id: profile.id,
        enabled: profile.enabled !== false
      },
      globalRules: sourceState.globalRules.map((rule) => summarizeRuleForLog(rule, "global")),
      domainRules: (profile.rules || []).map((rule) => summarizeRuleForLog(rule, "domain", { domain: profile.id }))
    });

    return {
      domain: clone(profile),
      settings: clone(sourceState.settings),
      globalRules: clone(sourceState.globalRules),
      domainRules: clone(profile.rules || []),
      fixedValues: clone(profile.fixedValues || {}),
      dataMode: EFFECTIVE_DATA_MODES.includes(dataMode) ? dataMode : "random"
    };
  }

  async function importState(jsonText) {
    const parsed = JSON.parse(jsonText);
    return saveState(parsed);
  }

  async function exportState() {
    const state = await getState();
    return JSON.stringify(state, null, 2);
  }

  // Backward-compatible aliases for older modules.
  async function getSettings() {
    return getState();
  }

  async function saveSettings(value) {
    return saveState(value);
  }

  async function resetSettings() {
    return resetState();
  }

  async function importSettings(jsonText) {
    return importState(jsonText);
  }

  async function exportSettings() {
    return exportState();
  }

  globalThis.ChaosFillStorage = {
    STORAGE_KEY,
    CURRENT_SETTINGS_VERSION,
    RULE_MATCH_TARGETS,
    DOMAIN_DATA_MODES,
    EFFECTIVE_DATA_MODES,
    DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
    DEFAULT_GLOBAL_RULES: clone(DEFAULT_GLOBAL_RULES),
    DEFAULT_STATE: clone(DEFAULT_STATE),
    createRuleId,
    splitTokenList,
    normalizeDomain,
    normalizeRule,
    normalizeSettings,
    normalizeState,
    getState,
    saveState,
    resetState,
    getOrCreateDomainProfile,
    saveDomainProfile,
    removeDomainProfile,
    hasDomainProfile,
    getEffectiveDomainConfig,
    listDomainsSorted,
    importState,
    exportState,
    getSettings,
    saveSettings,
    resetSettings,
    importSettings,
    exportSettings
  };
})();
