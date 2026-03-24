(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const STORAGE_KEY = "settings";
  const CURRENT_SETTINGS_VERSION = 6;
  const VAT_RULE_PATTERN = "(vat|ust\\s*-?idnr|uid|sales.*tax(?:.*(id|number))?|tax\\s*(id|number)|vendor\\.salestaxid|company\\.salestaxid)";
  const LEGACY_VAT_RULE_PATTERNS = [
    "vat",
    "(vat|sales\\s*tax|tax\\s*(id|number)|ust\\s*-?idnr|uid)"
  ];
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

  const DEFAULT_RULES = [
    {
      id: "rule-first-name",
      title: "First Name",
      generator: { type: "firstName" },
      match: { kind: "contains", pattern: "first name", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-last-name",
      title: "Last Name",
      generator: { type: "lastName" },
      match: { kind: "regex", pattern: "(last|family|sur)\\s*name", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-full-name",
      title: "Full Name",
      generator: { type: "fullName" },
      match: { kind: "contains", pattern: "full name", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-email",
      title: "Email",
      generator: { type: "email" },
      match: { kind: "contains", pattern: "email", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-number",
      title: "Number",
      generator: { type: "number" },
      match: { kind: "regex", pattern: "(amount|qty|quantity|count|age)", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-phone",
      title: "Phone",
      generator: { type: "phone" },
      match: { kind: "regex", pattern: "(phone|mobile|tel)", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-company",
      title: "Company",
      generator: { type: "company" },
      match: { kind: "contains", pattern: "company", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-street",
      title: "Street",
      generator: { type: "street" },
      match: { kind: "regex", pattern: "(street|address|addr)", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-city",
      title: "City",
      generator: { type: "city" },
      match: { kind: "contains", pattern: "city", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-zip",
      title: "ZIP/Postal",
      generator: { type: "zip" },
      match: { kind: "regex", pattern: "(zip|postal|post code)", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-country",
      title: "Country",
      generator: { type: "country" },
      match: { kind: "contains", pattern: "country", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-iban",
      title: "IBAN",
      generator: { type: "iban" },
      match: { kind: "contains", pattern: "iban", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-bic",
      title: "BIC/SWIFT",
      generator: { type: "bic" },
      match: { kind: "regex", pattern: "(bic|swift)", target: "any" },
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-vat",
      title: "VAT ID",
      generator: { type: "vatId" },
      match: { kind: "regex", pattern: VAT_RULE_PATTERN, target: "any" },
      outputMask: "DE#########",
      domainRegex: "",
      enabled: true
    },
    {
      id: "rule-password",
      title: "Password",
      generator: { type: "password" },
      match: { kind: "contains", pattern: "password", target: "any" },
      domainRegex: "",
      enabled: true
    }
  ];

  const DEFAULT_SETTINGS = {
    version: CURRENT_SETTINGS_VERSION,
    rules: DEFAULT_RULES,
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
    },
    general: {
      triggerEvents: true,
      contextMenuEnabled: true,
      ignoreHiddenInvisible: true,
      ignoreExistingContent: false,
      ignoreMatchTokens: ["captcha", "hipinputtext"],
      confirmationTokens: ["confirm", "reenter", "retype", "repeat", "secondary"],
      agreeTokens: ["agree", "terms", "conditions"],
      ignoredDomains: [],
      enableSensitiveDenylist: true,
      useAttributes: {
        id: true,
        name: true,
        label: true,
        ariaLabel: true,
        ariaLabelledby: true,
        placeholder: true,
        class: false,
        type: true
      }
    }
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

  function normalizeRule(rule, index) {
    const safe = rule && typeof rule === "object" ? rule : {};
    const match = safe.match && typeof safe.match === "object" ? safe.match : {};
    const generator = safe.generator && typeof safe.generator === "object" ? safe.generator : { type: "lorem" };

    return {
      id: typeof safe.id === "string" && safe.id ? safe.id : createRuleId(),
      title: typeof safe.title === "string" && safe.title ? safe.title : `Rule ${index + 1}`,
      generator: {
        type: typeof generator.type === "string" && generator.type ? generator.type : "lorem",
        items: Array.isArray(generator.items)
          ? generator.items.map((item) => String(item)).filter(Boolean)
          : []
      },
      match: {
        kind: ["contains", "equals", "regex"].includes(match.kind) ? match.kind : "contains",
        pattern: stripTypePrefixedPatternOptions(typeof match.pattern === "string" ? match.pattern : ""),
        target: RULE_MATCH_TARGETS.includes(match.target) ? match.target : "any"
      },
      outputMask: typeof safe.outputMask === "string" ? safe.outputMask : "",
      domainRegex: typeof safe.domainRegex === "string" ? safe.domainRegex : "",
      enabled: safe.enabled !== false
    };
  }

  function stripTypePrefixedPatternOptions(patternValue) {
    return String(patternValue || "")
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry && !/^type\s*[:=]/i.test(entry))
      .join("; ");
  }

  function normalizeTokenArray(value, fallback) {
    if (Array.isArray(value)) {
      return value
        .map((token) => String(token || "").trim())
        .filter(Boolean);
    }
    return clone(fallback);
  }

  function normalizeEmailDomain(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/^@+/, "");

    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
      return normalized;
    }

    return "example.com";
  }

  function migrateSettings(value) {
    const safeValue = value && typeof value === "object" ? clone(value) : {};
    const legacyVersion = Number(safeValue.version || 0);

    if (legacyVersion < 2 && Array.isArray(safeValue.rules)) {
      safeValue.rules = safeValue.rules.map((rule) => {
        const match = rule?.match || {};
        const isLegacyVatRule = rule?.id === "rule-vat"
          && match.kind === "contains"
          && String(match.pattern || "").trim().toLowerCase() === "vat";

        if (!isLegacyVatRule) {
          return rule;
        }

        return {
          ...rule,
          match: {
            kind: "regex",
            pattern: VAT_RULE_PATTERN,
            target: RULE_MATCH_TARGETS.includes(match.target) ? match.target : "any"
          }
        };
      });
    }

    if (legacyVersion < 3 && Array.isArray(safeValue.rules)) {
      safeValue.rules = safeValue.rules.map((rule) => {
        const safeRule = rule && typeof rule === "object" ? rule : {};
        const match = safeRule.match && typeof safeRule.match === "object" ? safeRule.match : {};
        const nextRule = {
          ...safeRule,
          match: {
            ...match,
            target: RULE_MATCH_TARGETS.includes(match.target) ? match.target : "any"
          }
        };

        const isVatRule = nextRule.id === "rule-vat";
        const normalizedPattern = String(match.pattern || "").trim().toLowerCase();
        if (isVatRule && LEGACY_VAT_RULE_PATTERNS.includes(normalizedPattern)) {
          nextRule.match.kind = "regex";
          nextRule.match.pattern = VAT_RULE_PATTERN;
        }

        return nextRule;
      });
    }

    if (legacyVersion < 4 && Array.isArray(safeValue.rules)) {
      safeValue.rules = safeValue.rules.map((rule) => {
        const safeRule = rule && typeof rule === "object" ? rule : {};
        const nextRule = {
          ...safeRule,
          outputMask: typeof safeRule.outputMask === "string" ? safeRule.outputMask : ""
        };

        if (nextRule.id === "rule-vat" && !nextRule.outputMask.trim()) {
          nextRule.outputMask = "DE#########";
        }

        return nextRule;
      });
    }

    if (legacyVersion < 5 && Array.isArray(safeValue.rules)) {
      safeValue.rules = safeValue.rules.map((rule) => {
        const safeRule = rule && typeof rule === "object" ? rule : {};
        const match = safeRule.match && typeof safeRule.match === "object" ? safeRule.match : {};
        return {
          ...safeRule,
          match: {
            ...match,
            pattern: stripTypePrefixedPatternOptions(match.pattern)
          }
        };
      });
    }

    safeValue.version = CURRENT_SETTINGS_VERSION;
    return safeValue;
  }

  function normalizeSettings(value) {
    const merged = mergeDefaults(migrateSettings(value), DEFAULT_SETTINGS);

    merged.version = CURRENT_SETTINGS_VERSION;
    merged.rules = Array.isArray(merged.rules)
      ? merged.rules.map((rule, index) => normalizeRule(rule, index))
      : clone(DEFAULT_RULES);

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
    merged.fallback.dateStart = String(merged.fallback.dateStart || "1970-01-01");
    merged.fallback.dateEnd = String(merged.fallback.dateEnd || "2030-12-31");
    merged.fallback.checkboxDefault = ["random", "checked", "unchecked"].includes(merged.fallback.checkboxDefault)
      ? merged.fallback.checkboxDefault
      : "random";
    merged.fallback.radioStrategy = ["random", "firstEnabled"].includes(merged.fallback.radioStrategy)
      ? merged.fallback.radioStrategy
      : "random";

    merged.general.triggerEvents = merged.general.triggerEvents !== false;
    merged.general.contextMenuEnabled = merged.general.contextMenuEnabled !== false;
    merged.general.ignoreHiddenInvisible = merged.general.ignoreHiddenInvisible !== false;
    merged.general.ignoreExistingContent = merged.general.ignoreExistingContent === true;
    merged.general.enableSensitiveDenylist = merged.general.enableSensitiveDenylist !== false;
    merged.general.ignoreMatchTokens = normalizeTokenArray(
      merged.general.ignoreMatchTokens,
      DEFAULT_SETTINGS.general.ignoreMatchTokens
    );
    merged.general.confirmationTokens = normalizeTokenArray(
      merged.general.confirmationTokens,
      DEFAULT_SETTINGS.general.confirmationTokens
    );
    merged.general.agreeTokens = normalizeTokenArray(
      merged.general.agreeTokens,
      DEFAULT_SETTINGS.general.agreeTokens
    );
    merged.general.ignoredDomains = normalizeTokenArray(merged.general.ignoredDomains, []);

    const defaultAttrs = DEFAULT_SETTINGS.general.useAttributes;
    const attrs = merged.general.useAttributes && typeof merged.general.useAttributes === "object"
      ? merged.general.useAttributes
      : {};
    merged.general.useAttributes = {
      id: attrs.id !== false,
      name: attrs.name !== false,
      label: attrs.label !== false,
      ariaLabel: attrs.ariaLabel !== false,
      ariaLabelledby: attrs.ariaLabelledby !== false,
      placeholder: attrs.placeholder !== false,
      class: attrs.class === true,
      type: attrs.type !== false
    };

    for (const key of Object.keys(defaultAttrs)) {
      if (!(key in merged.general.useAttributes)) {
        merged.general.useAttributes[key] = defaultAttrs[key];
      }
    }

    return merged;
  }

  async function getLocal(key) {
    const result = await api.storage.local.get(key);
    return result?.[key];
  }

  async function setLocal(value) {
    await api.storage.local.set(value);
  }

  async function getSettings() {
    const raw = await getLocal(STORAGE_KEY);
    const normalized = normalizeSettings(raw);
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await setLocal({ [STORAGE_KEY]: normalized });
    }
    return normalized;
  }

  async function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    await setLocal({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function resetSettings() {
    const defaults = normalizeSettings(DEFAULT_SETTINGS);
    await setLocal({ [STORAGE_KEY]: defaults });
    return defaults;
  }

  async function importSettings(jsonText) {
    const parsed = JSON.parse(jsonText);
    return saveSettings(parsed);
  }

  async function exportSettings() {
    const settings = await getSettings();
    return JSON.stringify(settings, null, 2);
  }

  function splitTokenList(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  globalThis.ChaosFillStorage = {
    STORAGE_KEY,
    CURRENT_SETTINGS_VERSION,
    RULE_MATCH_TARGETS,
    DEFAULT_SETTINGS: clone(DEFAULT_SETTINGS),
    DEFAULT_RULES: clone(DEFAULT_RULES),
    createRuleId,
    normalizeSettings,
    splitTokenList,
    getSettings,
    saveSettings,
    resetSettings,
    importSettings,
    exportSettings
  };
})();
