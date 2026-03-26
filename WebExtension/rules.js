(() => {
  const DEFAULT_SENSITIVE_HOST_PARTS = [
    "bank",
    "banking",
    "payment",
    "payments",
    "stripe",
    "paypal",
    "klarna"
  ];

  const DEFAULT_SENSITIVE_PATH_PARTS = [
    "checkout",
    "pay",
    "billing"
  ];

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getSettings(configLike) {
    return configLike?.settings || configLike || {};
  }

  function getCheckedAttribute(attrMap, key, defaultValue = true) {
    if (!attrMap || typeof attrMap !== "object") return defaultValue;
    if (!(key in attrMap)) return defaultValue;
    return attrMap[key] !== false;
  }

  function buildMatchBundle(element, settingsLike) {
    const settings = getSettings(settingsLike);
    const attrs = settings?.useAttributes || settings?.general?.useAttributes || {};
    const metadata = globalThis.ChaosFillDom.getFieldMetadata(element);
    const parts = [];

    if (getCheckedAttribute(attrs, "name")) parts.push(metadata.name);
    if (getCheckedAttribute(attrs, "id")) parts.push(metadata.id);
    if (getCheckedAttribute(attrs, "type")) parts.push(metadata.type);
    if (getCheckedAttribute(attrs, "placeholder")) parts.push(metadata.placeholder);
    if (getCheckedAttribute(attrs, "label")) parts.push(metadata.labelText);
    if (getCheckedAttribute(attrs, "ariaLabel")) parts.push(metadata.ariaLabel);
    if (getCheckedAttribute(attrs, "ariaLabelledby")) parts.push(metadata.ariaLabelledbyText);
    if (attrs.class === true) parts.push(metadata.className);

    const fields = {
      any: normalizeText(parts.join(" ")),
      id: normalizeText(metadata.id),
      name: normalizeText(metadata.name),
      type: normalizeText(metadata.type),
      placeholder: normalizeText(metadata.placeholder),
      label: normalizeText(metadata.labelText),
      ariaLabel: normalizeText(metadata.ariaLabel),
      ariaLabelledby: normalizeText(metadata.ariaLabelledbyText),
      class: normalizeText(metadata.className)
    };

    return {
      parts,
      fields,
      metadata,
      text: fields.any
    };
  }

  function safeRegExp(pattern, flags = "i") {
    try {
      return new RegExp(pattern, flags);
    } catch (_error) {
      return null;
    }
  }

  function splitMatchPatterns(value) {
    return String(value || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function normalizeTarget(value) {
    const key = String(value || "").trim().toLowerCase();
    if (!key) return null;

    const map = {
      any: "any",
      bundle: "any",
      id: "id",
      name: "name",
      type: "type",
      placeholder: "placeholder",
      label: "label",
      class: "class",
      arialabel: "ariaLabel",
      "aria-label": "ariaLabel",
      arialabelledby: "ariaLabelledby",
      "aria-labelledby": "ariaLabelledby",
      arialabelledbytext: "ariaLabelledby"
    };

    return map[key] || null;
  }

  function parsePatternEntry(rawPattern) {
    const raw = String(rawPattern || "").trim();
    const prefixedMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*[:=]\s*(.+)$/);
    if (!prefixedMatch) {
      return { target: null, pattern: raw };
    }

    const parsedTarget = normalizeTarget(prefixedMatch[1]);
    if (!parsedTarget) {
      return { target: null, pattern: raw };
    }

    return {
      target: parsedTarget,
      pattern: String(prefixedMatch[2] || "").trim()
    };
  }

  function doesRuleMatch(rule, bundle, hostname) {
    if (!rule || rule.enabled === false || !rule.match) {
      return false;
    }

    if (rule.domainRegex) {
      const hostRegex = safeRegExp(rule.domainRegex, "i");
      if (!hostRegex || !hostRegex.test(hostname)) {
        return false;
      }
    }

    const fallbackTarget = normalizeTarget(rule.match.target) || "any";
    const rawPatterns = splitMatchPatterns(rule.match.pattern)
      .map((rawPattern) => parsePatternEntry(rawPattern))
      .filter((entry) => entry.pattern);
    if (rawPatterns.length === 0) {
      return false;
    }

    return rawPatterns.some((entry) => {
      const target = entry.target || fallbackTarget;
      const haystack = bundle.fields?.[target] ?? bundle.text;
      if (!haystack) {
        return false;
      }

      if (rule.match.kind === "equals") {
        return haystack === normalizeText(entry.pattern);
      }

      if (rule.match.kind === "regex") {
        const regex = safeRegExp(entry.pattern, "i");
        return regex ? regex.test(haystack) : false;
      }

      return haystack.includes(normalizeText(entry.pattern));
    });
  }

  function resolveRule(rules, bundle, hostname) {
    const safeRules = Array.isArray(rules) ? rules : [];
    for (let index = 0; index < safeRules.length; index += 1) {
      const rule = safeRules[index];
      if (doesRuleMatch(rule, bundle, hostname)) {
        return { rule, index };
      }
    }
    return null;
  }

  function hasEnabledRules(rules) {
    const safeRules = Array.isArray(rules) ? rules : [];
    return safeRules.some((rule) => rule && rule.enabled !== false);
  }

  function getFallbackGenerator(element) {
    const kind = globalThis.ChaosFillDom.getFieldKind(element);

    switch (kind) {
      case "textarea":
        return { type: "lorem" };
      case "date":
        return { type: "date" };
      case "datetime-local":
        return { type: "datetime-local" };
      case "checkbox":
        return { type: "checkbox-default" };
      case "radio":
        return { type: "radio-default" };
      case "select":
        return { type: "select-default" };
      case "text":
      default:
        return { type: "lorem" };
    }
  }

  function sanitizeKey(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .slice(0, 120);
  }

  function inferResolvedKey(element, bundle, matchedRule, generator) {
    const explicit = sanitizeKey(matchedRule?.resolvedKey);
    if (explicit) return explicit;

    const generatorType = sanitizeKey(generator?.type);
    if (generatorType && !["lorem", "checkbox-default", "radio-default", "select-default"].includes(generatorType)) {
      return generatorType;
    }

    const metadata = bundle?.metadata || {};
    const fromName = sanitizeKey(metadata.name);
    if (fromName) return fromName;

    const fromId = sanitizeKey(metadata.id);
    if (fromId) return fromId;

    const fromPlaceholder = sanitizeKey(metadata.placeholder);
    if (fromPlaceholder) return fromPlaceholder;

    const kind = globalThis.ChaosFillDom.getFieldKind(element) || "text";
    return `field.${kind}`;
  }

  function lookupFixedValue(fixedValues, resolvedKey) {
    if (!fixedValues || typeof fixedValues !== "object" || !resolvedKey) {
      return { found: false, value: "" };
    }

    if (Object.prototype.hasOwnProperty.call(fixedValues, resolvedKey)) {
      return { found: true, value: fixedValues[resolvedKey] };
    }

    const normalizedKey = resolvedKey.toLowerCase();
    for (const [key, value] of Object.entries(fixedValues)) {
      if (String(key || "").toLowerCase() === normalizedKey) {
        return { found: true, value };
      }
    }

    return { found: false, value: "" };
  }

  function resolveGenerator(element, bundle, configLike, hostname) {
    const config = configLike || {};
    const domainRules = Array.isArray(config.domainRules) ? config.domainRules : [];
    const globalRules = Array.isArray(config.globalRules) ? config.globalRules : [];

    const safeHostname = hostname || globalThis.location.hostname;
    const domainMatch = resolveRule(domainRules, bundle, safeHostname);
    const globalMatch = domainMatch ? null : resolveRule(globalRules, bundle, safeHostname);

    const matchedRule = domainMatch?.rule || globalMatch?.rule || null;
    const source = domainMatch
      ? "domain-rule"
      : globalMatch
        ? "global-rule"
        : "fallback";

    const generator = matchedRule
      ? {
          type: matchedRule.generator?.type || "lorem",
          items: Array.isArray(matchedRule.generator?.items) ? matchedRule.generator.items : []
        }
      : getFallbackGenerator(element);

    const resolvedKey = inferResolvedKey(element, bundle, matchedRule, generator);
    const overrideEnabled = typeof matchedRule?.overrideEnabled === "boolean"
      ? matchedRule.overrideEnabled
      : (typeof matchedRule?.overrideValue === "string" && matchedRule.overrideValue.length > 0);

    return {
      source,
      ruleId: matchedRule?.id || null,
      outputMask: typeof matchedRule?.outputMask === "string" ? matchedRule.outputMask : "",
      generator,
      resolvedKey,
      overrideEnabled,
      overrideValue: typeof matchedRule?.overrideValue === "string" ? matchedRule.overrideValue : "",
      fixedValue: null,
      hasFixedValue: false
    };
  }

  function shouldIgnoreByTokens(bundleText, tokens) {
    const haystack = normalizeText(bundleText);
    const tokenList = Array.isArray(tokens) ? tokens : [];

    for (const token of tokenList) {
      const needle = normalizeText(token);
      if (!needle) continue;
      if (haystack.includes(needle)) {
        return true;
      }
    }

    return false;
  }

  function containsAny(text, values) {
    const safeText = normalizeText(text);
    return values.some((part) => safeText.includes(part));
  }

  function isDomainBlocked(urlLike, settingsLike) {
    const settings = getSettings(settingsLike);
    const url = typeof urlLike === "string" ? new URL(urlLike) : urlLike;
    const host = normalizeText(url.hostname);
    const path = normalizeText(url.pathname);

    if (settings.sensitiveDenylistEnabled !== false && settings.general?.enableSensitiveDenylist !== false) {
      if (containsAny(host, DEFAULT_SENSITIVE_HOST_PARTS)) {
        return { blocked: true, reason: "sensitive-host" };
      }
      if (containsAny(path, DEFAULT_SENSITIVE_PATH_PARTS)) {
        return { blocked: true, reason: "sensitive-path" };
      }
    }

    const ignoredDomains = Array.isArray(settings.ignoredDomains)
      ? settings.ignoredDomains
      : (Array.isArray(settings.general?.ignoredDomains) ? settings.general.ignoredDomains : []);

    for (const pattern of ignoredDomains) {
      const candidate = String(pattern || "").trim();
      if (!candidate) continue;
      const regex = safeRegExp(candidate, "i");
      if (!regex) continue;
      if (regex.test(host) || regex.test(url.href)) {
        return { blocked: true, reason: "ignored-domain", pattern: candidate };
      }
    }

    return { blocked: false };
  }

  function isConfirmationField(bundle, settingsLike) {
    const settings = getSettings(settingsLike);
    const tokens = Array.isArray(settings.confirmationTokens)
      ? settings.confirmationTokens
      : (Array.isArray(settings.general?.confirmationTokens) ? settings.general.confirmationTokens : []);
    return shouldIgnoreByTokens(bundle.text, tokens);
  }

  function isAgreeField(bundle, settingsLike) {
    const settings = getSettings(settingsLike);
    const tokens = Array.isArray(settings.agreeTokens)
      ? settings.agreeTokens
      : (Array.isArray(settings.general?.agreeTokens) ? settings.general.agreeTokens : []);
    return shouldIgnoreByTokens(bundle.text, tokens);
  }

  globalThis.ChaosFillRules = {
    DEFAULT_SENSITIVE_HOST_PARTS,
    DEFAULT_SENSITIVE_PATH_PARTS,
    normalizeText,
    safeRegExp,
    buildMatchBundle,
    doesRuleMatch,
    resolveRule,
    hasEnabledRules,
    resolveGenerator,
    lookupFixedValue,
    inferResolvedKey,
    shouldIgnoreByTokens,
    isDomainBlocked,
    isConfirmationField,
    isAgreeField
  };
})();
