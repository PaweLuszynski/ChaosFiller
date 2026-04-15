(() => {
  const RULE_LOG_PREFIX = "CHAOSFILL_RULES:";
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

  const MATCH_TYPE_PRIORITY = {
    equals: 3,
    regex: 2,
    contains: 1
  };

  const MATCH_TYPE_BASE_SCORE = {
    equals: 1000,
    regex: 700,
    contains: 450
  };

  const TARGET_BASE_SCORE = {
    name: 180,
    id: 170,
    label: 150,
    ariaLabel: 145,
    ariaLabelledby: 140,
    placeholder: 130,
    type: 40,
    class: 20,
    any: 5
  };

  const TARGET_PRIORITY = {
    name: 8,
    id: 7,
    label: 6,
    ariaLabel: 5,
    ariaLabelledby: 4,
    placeholder: 3,
    type: 2,
    class: 1,
    any: 0
  };

  const SOURCE_PRIORITY = {
    "domain-rule": 2,
    "global-rule": 1
  };

  const INFER_PATTERNS = {
    firstName: /\b(first[\s._-]*name|given[\s._-]*name|forename)\b/i,
    lastName: /\b(last[\s._-]*name|family[\s._-]*name|surname)\b/i,
    fullName: /\b(full[\s._-]*name)\b/i,
    email: /\b(e[\s._-]*mail)\b/i,
    phone: /\b(phone|mobile|tel|telephone)\b/i,
    company: /\b(company|organisation|organization|business|firm)\b/i,
    street: /\b(street|address|addr|line[\s._-]*1|line[\s._-]*2)\b/i,
    city: /\b(city|town)\b/i,
    zip: /\b(zip|postal|postcode|post[\s._-]*code)\b/i,
    country: /\b(country|nation)\b/i,
    iban: /\b(iban|account[\s._-]*number|bank[\s._-]*account)\b/i,
    bic: /\b(bic|swift)\b/i,
    vatId: /\b(vat|ust|uid|sales[\s._-]*tax|tax[\s._-]*(id|number)|vendor[\s._-]*sales[\s._-]*tax[\s._-]*id|company[\s._-]*sales[\s._-]*tax[\s._-]*id)\b/i
  };

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function shorten(value, max = 80) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }

  function logRuleEvent(eventName, payload) {
    console.log(RULE_LOG_PREFIX, `${eventName} ${JSON.stringify(payload)}`);
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
    const enabledTargets = {
      name: getCheckedAttribute(attrs, "name"),
      id: getCheckedAttribute(attrs, "id"),
      type: getCheckedAttribute(attrs, "type"),
      placeholder: getCheckedAttribute(attrs, "placeholder"),
      label: getCheckedAttribute(attrs, "label"),
      ariaLabel: getCheckedAttribute(attrs, "ariaLabel"),
      ariaLabelledby: getCheckedAttribute(attrs, "ariaLabelledby"),
      class: attrs.class === true
    };

    if (enabledTargets.name) parts.push(metadata.name);
    if (enabledTargets.id) parts.push(metadata.id);
    if (enabledTargets.type) parts.push(metadata.type);
    if (enabledTargets.placeholder) parts.push(metadata.placeholder);
    if (enabledTargets.label) parts.push(metadata.labelText);
    if (enabledTargets.ariaLabel) parts.push(metadata.ariaLabel);
    if (enabledTargets.ariaLabelledby) parts.push(metadata.ariaLabelledbyText);
    if (enabledTargets.class) parts.push(metadata.className);

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
      enabledTargets,
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

  function getAnyCandidateTargets(bundle) {
    const enabled = bundle?.enabledTargets || {};
    const ordered = ["name", "id", "label", "ariaLabel", "ariaLabelledby", "placeholder", "type", "class"];
    const targets = ordered.filter((target) => {
      if (enabled[target] === false) return false;
      return Boolean(bundle?.fields?.[target]);
    });
    if (bundle?.fields?.any) {
      targets.push("any");
    }
    return targets.length > 0 ? targets : ["any"];
  }

  function getCandidateTargets(target, bundle) {
    if (target === "any") {
      return getAnyCandidateTargets(bundle);
    }
    return [target];
  }

  function evaluateMatchByKind(kind, haystack, rawPattern) {
    const normalizedHaystack = normalizeText(haystack);
    if (!normalizedHaystack) {
      return { matched: false };
    }

    if (kind === "equals") {
      const needle = normalizeText(rawPattern);
      if (!needle) return { matched: false };
      const matched = normalizedHaystack === needle;
      return {
        matched,
        exact: matched,
        matchedLength: matched ? needle.length : 0,
        matchedText: matched ? needle : ""
      };
    }

    if (kind === "regex") {
      const regex = safeRegExp(rawPattern, "i");
      if (!regex) return { matched: false };
      const result = regex.exec(normalizedHaystack);
      if (!result || !result[0]) {
        return { matched: false };
      }
      return {
        matched: true,
        exact: result[0].length === normalizedHaystack.length,
        matchedLength: result[0].length,
        matchedText: result[0]
      };
    }

    const needle = normalizeText(rawPattern);
    if (!needle) return { matched: false };
    const matched = normalizedHaystack.includes(needle);
    return {
      matched,
      exact: matched && normalizedHaystack === needle,
      matchedLength: matched ? needle.length : 0,
      matchedText: matched ? needle : ""
    };
  }

  function getShortPatternPenalty(length) {
    if (length <= 2) return -260;
    if (length <= 3) return -200;
    if (length <= 4) return -130;
    if (length <= 5) return -70;
    return 0;
  }

  function computeMatchScore(params) {
    const kind = params.kind || "contains";
    const target = params.target || "any";
    const matchedLength = Number(params.matchedLength || 0);
    const exact = params.exact === true;
    const explicitPatternTarget = params.explicitPatternTarget === true;
    const ruleTarget = params.ruleTarget || "any";

    const base = MATCH_TYPE_BASE_SCORE[kind] || MATCH_TYPE_BASE_SCORE.contains;
    const targetScore = TARGET_BASE_SCORE[target] ?? TARGET_BASE_SCORE.any;
    const specificity = Math.min(240, matchedLength * 12);
    const shortPenalty = getShortPatternPenalty(matchedLength);
    const exactBonus = exact ? (kind === "equals" ? 140 : (kind === "regex" ? 90 : 120)) : 0;
    const explicitTargetBonus = explicitPatternTarget ? 60 : 0;
    const explicitRuleTargetBonus = ruleTarget && ruleTarget !== "any" ? 35 : 0;

    return base + targetScore + specificity + shortPenalty + exactBonus + explicitTargetBonus + explicitRuleTargetBonus;
  }

  function comparePatternMatches(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    if ((MATCH_TYPE_PRIORITY[a.kind] || 0) !== (MATCH_TYPE_PRIORITY[b.kind] || 0)) {
      return (MATCH_TYPE_PRIORITY[b.kind] || 0) - (MATCH_TYPE_PRIORITY[a.kind] || 0);
    }
    if ((TARGET_PRIORITY[a.target] || 0) !== (TARGET_PRIORITY[b.target] || 0)) {
      return (TARGET_PRIORITY[b.target] || 0) - (TARGET_PRIORITY[a.target] || 0);
    }
    if (a.matchedLength !== b.matchedLength) return b.matchedLength - a.matchedLength;
    return a.entryIndex - b.entryIndex;
  }

  function evaluateRulePatternEntry(rule, entry, entryIndex, fallbackTarget, bundle) {
    const baseTarget = entry.target || fallbackTarget || "any";
    const candidateTargets = getCandidateTargets(baseTarget, bundle);
    const kind = rule?.match?.kind || "contains";
    let best = null;

    for (const target of candidateTargets) {
      const haystack = bundle?.fields?.[target] ?? "";
      if (!haystack) continue;

      const result = evaluateMatchByKind(kind, haystack, entry.pattern);
      if (!result.matched) continue;

      const score = computeMatchScore({
        kind,
        target,
        matchedLength: result.matchedLength,
        exact: result.exact,
        explicitPatternTarget: Boolean(entry.target),
        ruleTarget: fallbackTarget
      });

      const candidate = {
        kind,
        target,
        score,
        entryIndex,
        pattern: entry.pattern,
        matchedText: result.matchedText,
        matchedLength: result.matchedLength,
        exact: result.exact
      };

      if (!best || comparePatternMatches(candidate, best) < 0) {
        best = candidate;
      }
    }

    return best;
  }

  function evaluateRuleMatch(rule, bundle, hostname, index, source, options = {}) {
    const includeDisabled = options.includeDisabled === true;
    const onlyDisabled = options.onlyDisabled === true;
    const isDisabled = rule?.enabled === false;

    if (!rule || !rule.match) {
      return null;
    }

    if (onlyDisabled && !isDisabled) {
      return null;
    }

    if (!onlyDisabled && isDisabled && !includeDisabled) {
      return null;
    }

    if (rule.domainRegex) {
      const hostRegex = safeRegExp(rule.domainRegex, "i");
      if (!hostRegex || !hostRegex.test(hostname)) {
        return null;
      }
    }

    const fallbackTarget = normalizeTarget(rule.match.target) || "any";
    const entries = splitMatchPatterns(rule.match.pattern)
      .map((rawPattern) => parsePatternEntry(rawPattern))
      .filter((entry) => entry.pattern);

    if (entries.length === 0) {
      return null;
    }

    let bestPatternMatch = null;
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const candidate = evaluateRulePatternEntry(rule, entries[entryIndex], entryIndex, fallbackTarget, bundle);
      if (!candidate) continue;
      if (!bestPatternMatch || comparePatternMatches(candidate, bestPatternMatch) < 0) {
        bestPatternMatch = candidate;
      }
    }

    if (!bestPatternMatch) {
      return null;
    }

    const resolvedKeyBonus = sanitizeKey(rule.resolvedKey) ? 25 : 0;
    const score = bestPatternMatch.score + resolvedKeyBonus;

    return {
      rule,
      index,
      source,
      score,
      match: bestPatternMatch
    };
  }

  function collectRuleCandidates(rules, bundle, hostname, source) {
    const safeRules = Array.isArray(rules) ? rules : [];
    const matches = [];

    for (let index = 0; index < safeRules.length; index += 1) {
      const evaluated = evaluateRuleMatch(safeRules[index], bundle, hostname, index, source, {
        includeDisabled: true
      });
      if (evaluated) {
        matches.push(evaluated);
      }
    }

    matches.sort(compareRuleMatches);
    return matches;
  }

  function compareRuleMatches(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    if ((SOURCE_PRIORITY[a.source] || 0) !== (SOURCE_PRIORITY[b.source] || 0)) {
      return (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0);
    }

    const aKindPriority = MATCH_TYPE_PRIORITY[a.match?.kind] || 0;
    const bKindPriority = MATCH_TYPE_PRIORITY[b.match?.kind] || 0;
    if (aKindPriority !== bKindPriority) return bKindPriority - aKindPriority;

    const aTargetPriority = TARGET_PRIORITY[a.match?.target] || 0;
    const bTargetPriority = TARGET_PRIORITY[b.match?.target] || 0;
    if (aTargetPriority !== bTargetPriority) return bTargetPriority - aTargetPriority;

    const aLength = Number(a.match?.matchedLength || 0);
    const bLength = Number(b.match?.matchedLength || 0);
    if (aLength !== bLength) return bLength - aLength;

    return a.index - b.index;
  }

  function resolveRuleMatches(rules, bundle, hostname, source, options = {}) {
    const matches = collectRuleCandidates(rules, bundle, hostname, source).filter((match) => {
      if (options.onlyDisabled === true) {
        return match.rule?.enabled === false;
      }
      if (options.includeDisabled === true) {
        return true;
      }
      return match.rule?.enabled !== false;
    });
    matches.sort(compareRuleMatches);
    return {
      best: matches[0] || null,
      matches
    };
  }

  function doesRuleMatch(rule, bundle, hostname) {
    return Boolean(evaluateRuleMatch(rule, bundle, hostname || globalThis.location.hostname, 0, "global-rule"));
  }

  function resolveRule(rules, bundle, hostname, source = "global-rule") {
    const resolved = resolveRuleMatches(rules, bundle, hostname, source);
    if (!resolved.best) return null;

    return {
      rule: resolved.best.rule,
      index: resolved.best.index,
      score: resolved.best.score,
      match: resolved.best.match,
      matches: resolved.matches
    };
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

  function getMetadataHintText(bundle) {
    const metadata = bundle?.metadata || {};
    return normalizeText([
      metadata.name,
      metadata.id,
      metadata.placeholder,
      metadata.labelText,
      metadata.ariaLabel,
      metadata.ariaLabelledbyText
    ].join(" "));
  }

  function inferGeneratorFromMetadata(element, bundle) {
    const kind = globalThis.ChaosFillDom.getFieldKind(element);
    const metadata = bundle?.metadata || {};
    const fieldType = normalizeText(metadata.type);
    const hintText = getMetadataHintText(bundle);

    if (kind === "date" || fieldType === "date") {
      return { type: "date", resolvedKey: "date" };
    }
    if (kind === "datetime-local" || fieldType === "datetime-local") {
      return { type: "datetime-local", resolvedKey: "datetime-local" };
    }
    if (fieldType === "email" || INFER_PATTERNS.email.test(hintText)) {
      return { type: "email", resolvedKey: "email" };
    }
    if (fieldType === "tel" || INFER_PATTERNS.phone.test(hintText)) {
      return { type: "phone", resolvedKey: "phone" };
    }
    if (fieldType === "number") {
      return { type: "number", resolvedKey: "number" };
    }
    if (fieldType === "password" || /\b(password|passcode)\b/i.test(hintText)) {
      return { type: "password", resolvedKey: "password" };
    }
    if (INFER_PATTERNS.vatId.test(hintText)) {
      return { type: "vatId", resolvedKey: "vatId" };
    }
    if (INFER_PATTERNS.iban.test(hintText)) {
      return { type: "iban", resolvedKey: "iban" };
    }
    if (INFER_PATTERNS.bic.test(hintText)) {
      return { type: "bic", resolvedKey: "bic" };
    }
    if (INFER_PATTERNS.firstName.test(hintText)) {
      return { type: "firstName", resolvedKey: "firstName" };
    }
    if (INFER_PATTERNS.lastName.test(hintText)) {
      return { type: "lastName", resolvedKey: "lastName" };
    }
    if (INFER_PATTERNS.fullName.test(hintText)) {
      return { type: "fullName", resolvedKey: "fullName" };
    }
    if (INFER_PATTERNS.company.test(hintText)) {
      return { type: "company", resolvedKey: "company" };
    }
    if (INFER_PATTERNS.street.test(hintText)) {
      return { type: "street", resolvedKey: "street" };
    }
    if (INFER_PATTERNS.city.test(hintText)) {
      return { type: "city", resolvedKey: "city" };
    }
    if (INFER_PATTERNS.zip.test(hintText)) {
      return { type: "zip", resolvedKey: "zip" };
    }
    if (INFER_PATTERNS.country.test(hintText)) {
      return { type: "country", resolvedKey: "country" };
    }

    return null;
  }

  function shouldDebugMatching(configLike) {
    const settings = getSettings(configLike);
    return settings?.debugMatching === true || globalThis.CHAOSFILL_DEBUG_MATCHING === true;
  }

  function sliceDebugText(value, max = 120) {
    const text = String(value || "");
    return text.length <= max ? text : `${text.slice(0, max)}...`;
  }

  function toDebugMatch(match) {
    return {
      source: match.source,
      ruleId: match.rule?.id || "",
      title: match.rule?.title || "",
      enabled: match.rule?.enabled !== false,
      generator: match.rule?.generator?.type || "lorem",
      resolvedKey: match.rule?.resolvedKey || "",
      score: match.score,
      orderIndex: match.index,
      kind: match.match?.kind || "",
      target: match.match?.target || "",
      pattern: match.match?.pattern || "",
      matchedText: sliceDebugText(match.match?.matchedText || ""),
      matchedLength: match.match?.matchedLength || 0
    };
  }

  function summarizeFieldForLog(bundle) {
    const metadata = bundle?.metadata || {};
    return {
      name: shorten(metadata.name),
      id: shorten(metadata.id),
      type: shorten(metadata.type),
      labelText: shorten(metadata.labelText),
      placeholder: shorten(metadata.placeholder),
      ariaLabel: shorten(metadata.ariaLabel),
      ariaLabelledbyText: shorten(metadata.ariaLabelledbyText)
    };
  }

  function logResolutionDecision(payload) {
    logRuleEvent("RULE_CANDIDATES_BEFORE_FILTER", {
      field: payload.fieldMetadata,
      candidates: payload.beforeFilter
    });
    logRuleEvent("RULE_CANDIDATES_AFTER_FILTER", {
      field: payload.fieldMetadata,
      candidates: payload.afterFilter
    });

    for (const skipped of payload.disabledSkipped || []) {
      logRuleEvent("DISABLED_RULE_SKIPPED", skipped);
    }

    logRuleEvent("RULE_MATCH_DECISION", {
      field: payload.fieldMetadata,
      chosenRule: payload.chosenRule,
      blockedRule: payload.blockedRule,
      decision: payload.resolved
    });
  }

  function resolveGenerator(element, bundle, configLike, hostname) {
    const config = configLike || {};
    const domainRules = Array.isArray(config.domainRules) ? config.domainRules : [];
    const globalRules = Array.isArray(config.globalRules) ? config.globalRules : [];

    const safeHostname = hostname || globalThis.location.hostname;
    const domainCandidates = collectRuleCandidates(domainRules, bundle, safeHostname, "domain-rule");
    const globalCandidates = collectRuleCandidates(globalRules, bundle, safeHostname, "global-rule");
    const allCandidates = [...domainCandidates, ...globalCandidates].sort(compareRuleMatches);
    const enabledCandidates = allCandidates.filter((match) => match.rule?.enabled !== false);
    const disabledCandidates = allCandidates.filter((match) => match.rule?.enabled === false);
    const bestOverall = allCandidates[0] || null;
    const matched = bestOverall && bestOverall.rule?.enabled !== false ? bestOverall : null;
    const disabledMatched = bestOverall && bestOverall.rule?.enabled === false ? bestOverall : null;
    const inferred = bestOverall ? null : inferGeneratorFromMetadata(element, bundle);

    const matchedRule = matched?.rule || disabledMatched?.rule || null;
    const source = matched
      ? matched.source
      : disabledMatched
        ? "disabled-rule"
        : inferred
          ? "inferred-key"
          : "fallback";

    const generator = matchedRule
      ? {
          type: matchedRule.generator?.type || "lorem",
          items: Array.isArray(matchedRule.generator?.items) ? matchedRule.generator.items : []
        }
      : inferred
        ? { type: inferred.type, items: [] }
        : getFallbackGenerator(element);

    const resolvedKey = inferred?.resolvedKey
      ? sanitizeKey(inferred.resolvedKey) || inferResolvedKey(element, bundle, matchedRule, generator)
      : inferResolvedKey(element, bundle, matchedRule, generator);
    const overrideEnabled = typeof matchedRule?.overrideEnabled === "boolean"
      ? matchedRule.overrideEnabled
      : (typeof matchedRule?.overrideValue === "string" && matchedRule.overrideValue.length > 0);

    const debugPayload = {
      enabled: shouldDebugMatching(config),
      fieldMetadata: summarizeFieldForLog(bundle),
      matchInput: bundle?.fields || {},
      beforeFilter: allCandidates.map((match) => toDebugMatch(match)),
      afterFilter: enabledCandidates.map((match) => toDebugMatch(match)),
      disabledSkipped: disabledCandidates.map((match) => ({
        field: summarizeFieldForLog(bundle),
        rule: toDebugMatch(match),
        reason: "enabled=false"
      })),
      chosenRule: matched ? toDebugMatch(matched) : null,
      blockedRule: disabledMatched ? toDebugMatch(disabledMatched) : null,
      resolved: {
        source,
        reason: matched
          ? "best-enabled-candidate"
          : disabledMatched
            ? "best-candidate-disabled"
            : inferred
              ? "metadata-inference"
              : "fallback-generator",
        generator: generator?.type || "lorem",
        resolvedKey,
        ruleId: matchedRule?.id || null,
        skipFill: disabledMatched !== null,
        overrideEnabled,
        overrideValuePresent: Boolean(typeof matchedRule?.overrideValue === "string" && matchedRule.overrideValue.length > 0)
      }
    };

    logResolutionDecision(debugPayload);

    return {
      source,
      ruleId: matchedRule?.id || null,
      ruleScore: matched?.score ?? disabledMatched?.score ?? null,
      outputMask: typeof matchedRule?.outputMask === "string" ? matchedRule.outputMask : "",
      generator,
      resolvedKey,
      overrideEnabled,
      overrideValue: typeof matchedRule?.overrideValue === "string" ? matchedRule.overrideValue : "",
      fixedValue: null,
      hasFixedValue: false,
      skipFill: disabledMatched !== null,
      skipReason: disabledMatched ? "disabled-rule" : "",
      debug: debugPayload
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
