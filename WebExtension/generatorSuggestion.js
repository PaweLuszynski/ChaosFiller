(() => {
  const SOURCE_WEIGHTS = {
    label: { strong: 100, partial: 80 },
    ariaLabel: { strong: 90, partial: 70 },
    ariaLabelledby: { strong: 90, partial: 70 },
    placeholder: { strong: 75, partial: 60 },
    name: { strong: 60, partial: 40 },
    id: { strong: 40, partial: 25 },
    nearbyText: { strong: 70, partial: 55 },
    type: { strong: 10, partial: 10 }
  };

  const STAGE_ORDER = [
    { id: "stage1", sources: ["label", "ariaLabel", "ariaLabelledby", "placeholder"], allowPartial: false },
    { id: "stage2", sources: ["name"], allowPartial: true },
    { id: "stage3", sources: ["id"], allowPartial: true },
    { id: "stage4", sources: ["nearbyText"], allowPartial: false },
    { id: "stage5", sources: ["type"], allowPartial: false }
  ];

  const INTENTS = [
    {
      generator: "firstName",
      phrases: ["first name", "given name", "forename", "firstname"],
      tokenGroups: [["first", "name"], ["given", "name"], ["forename"], ["firstname"]]
    },
    {
      generator: "lastName",
      phrases: ["last name", "family name", "surname", "lastname"],
      tokenGroups: [["last", "name"], ["family", "name"], ["surname"], ["lastname"]]
    },
    {
      generator: "fullName",
      phrases: ["full name", "your name", "contact name"],
      tokenGroups: [["full", "name"], ["contact", "name"]]
    },
    {
      generator: "company",
      phrases: ["company name", "business name", "organization name", "organisation name"],
      tokenGroups: [["company", "name"], ["business", "name"], ["organization", "name"], ["organisation", "name"], ["company"]]
    },
    {
      generator: "email",
      phrases: ["email address", "e-mail address", "email", "e-mail"],
      tokenGroups: [["email"], ["e", "mail"]]
    },
    {
      generator: "phone",
      phrases: ["phone number", "mobile number", "telephone number", "telephone", "phone", "tel"],
      tokenGroups: [["phone", "number"], ["mobile", "number"], ["telephone"], ["phone"], ["mobile"], ["tel"]]
    },
    {
      generator: "vatId",
      phrases: ["vat id", "vat number", "tax id", "tax number", "sales tax", "ust id", "uid number"],
      tokenGroups: [["vat", "id"], ["vat", "number"], ["tax", "id"], ["tax", "number"], ["sales", "tax"], ["ust", "id"], ["uid", "number"]]
    },
    {
      generator: "streetAddress1",
      phrases: ["address line 1", "address1", "street address", "street line 1"],
      tokenGroups: [["address", "line", "1"], ["address", "1"], ["address1"], ["street", "1"], ["street", "address"]]
    },
    {
      generator: "streetAddress2",
      phrases: ["address line 2", "address2", "street line 2", "apartment", "suite"],
      tokenGroups: [["address", "line", "2"], ["address", "2"], ["address2"], ["street", "2"], ["apartment"], ["suite"]]
    },
    {
      generator: "city",
      phrases: ["city", "town"],
      tokenGroups: [["city"], ["town"]]
    },
    {
      generator: "postalCode",
      phrases: ["postal code", "zip code", "post code", "postcode", "zip"],
      tokenGroups: [["postal", "code"], ["zip", "code"], ["post", "code"], ["postcode"], ["zip"]]
    },
    {
      generator: "country",
      phrases: ["country"],
      tokenGroups: [["country"]]
    },
    {
      generator: "iban",
      phrases: ["iban", "bank account", "bank account number"],
      tokenGroups: [["iban"], ["bank", "account"], ["account", "number"]]
    },
    {
      generator: "bic",
      phrases: ["bic", "swift", "swift code"],
      tokenGroups: [["bic"], ["swift"]]
    },
    {
      generator: "password",
      phrases: ["password", "passcode"],
      tokenGroups: [["password"], ["passcode"]]
    },
    {
      generator: "date",
      phrases: ["date of birth", "birth date", "dob", "start date", "end date", "issue date"],
      tokenGroups: [["date", "birth"], ["birth", "date"], ["dob"], ["start", "date"], ["end", "date"], ["issue", "date"], ["date"]]
    }
  ];

  function safeString(value) {
    return String(value || "").trim();
  }

  function normalizeText(value) {
    return safeString(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([a-zA-Z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-zA-Z])/g, "$1 $2")
      .replace(/[._:/\\,[\](){}-]+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  }

  function tokenize(value) {
    return normalizeText(value)
      .split(" ")
      .map((token) => token.replace(/^\d+/, "").replace(/\d+$/, "").trim())
      .filter(Boolean);
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function containsPhrase(text, phrase) {
    const haystack = normalizeText(text);
    const needle = normalizeText(phrase);
    if (!haystack || !needle) return false;
    const regex = new RegExp(`(^|\\s)${escapeRegExp(needle)}(\\s|$)`, "i");
    return regex.test(haystack);
  }

  function matchesTokenGroup(tokens, tokenGroup) {
    if (!Array.isArray(tokenGroup) || tokenGroup.length === 0) {
      return false;
    }
    const normalizedTokens = new Set(tokens);
    return tokenGroup.every((token) => normalizedTokens.has(normalizeText(token)));
  }

  function detectIntentInSource(intent, sourceText, allowPartial) {
    if (!sourceText) return null;

    for (const phrase of intent.phrases || []) {
      if (containsPhrase(sourceText, phrase)) {
        return {
          level: "strong",
          reason: `phrase '${phrase}'`
        };
      }
    }

    if (!allowPartial) {
      return null;
    }

    const tokens = tokenize(sourceText);
    for (const tokenGroup of intent.tokenGroups || []) {
      if (matchesTokenGroup(tokens, tokenGroup)) {
        return {
          level: "partial",
          reason: `tokens '${tokenGroup.join(" ")}'`
        };
      }
    }

    return null;
  }

  function isLikelyDynamicId(value) {
    const raw = safeString(value);
    if (!raw) return true;

    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw);
    const longHashLike = /^[a-z0-9_-]{20,}$/i.test(raw);
    const containsLongDigits = /\d{4,}/.test(raw);
    const mixed = /[a-z]/i.test(raw) && /\d/.test(raw);
    return uuidLike || longHashLike || (containsLongDigits && mixed);
  }

  function buildSources(fieldMetadata) {
    const inputType = safeString(fieldMetadata?.type).toLowerCase();
    const normalizedId = safeString(fieldMetadata?.id);

    return {
      label: safeString(fieldMetadata?.labelText),
      ariaLabel: safeString(fieldMetadata?.ariaLabel),
      ariaLabelledby: safeString(fieldMetadata?.ariaLabelledbyText),
      placeholder: safeString(fieldMetadata?.placeholder),
      name: safeString(fieldMetadata?.name),
      id: isLikelyDynamicId(normalizedId) ? "" : normalizedId,
      nearbyText: safeString(fieldMetadata?.nearbyText),
      type: inputType === "datetime-local" ? "date" : inputType
    };
  }

  function applyTypeStage(entries, sources) {
    const typeValue = normalizeText(sources.type);
    if (!typeValue) return;

    const fallbackMap = {
      email: "email",
      tel: "phone",
      password: "password",
      date: "date"
    };

    const generator = fallbackMap[typeValue];
    if (!generator) return;

    entries.push({
      generator,
      source: "type",
      level: "strong",
      stage: "stage5",
      score: SOURCE_WEIGHTS.type.strong,
      detail: `input type '${typeValue}'`
    });
  }

  function aggregateEntries(entries) {
    const scores = new Map();
    for (const entry of entries) {
      if (!scores.has(entry.generator)) {
        scores.set(entry.generator, {
          generator: entry.generator,
          score: 0,
          entries: []
        });
      }
      const target = scores.get(entry.generator);
      target.score += entry.score;
      target.entries.push(entry);
    }

    return Array.from(scores.values()).sort((a, b) => b.score - a.score);
  }

  function computeConfidence(stage, winner, runnerUp) {
    const margin = winner.score - (runnerUp?.score || 0);
    const hasStrongLabelLike = winner.entries.some((entry) =>
      entry.level === "strong" && ["label", "ariaLabel", "ariaLabelledby", "nearbyText"].includes(entry.source)
    );

    if (stage === "stage1") {
      return hasStrongLabelLike || margin >= 20 ? "high" : "medium";
    }

    if (stage === "stage4") {
      return hasStrongLabelLike && margin >= 10 ? "high" : "medium";
    }

    if (stage === "stage2") {
      return "medium";
    }

    if (stage === "stage3" || stage === "stage5") {
      return "low";
    }

    return "low";
  }

  function bestReason(winner) {
    const topEntry = winner.entries
      .slice()
      .sort((a, b) => b.score - a.score)[0];

    if (!topEntry) {
      return "Best semantic match";
    }

    return `Matched ${topEntry.source} via ${topEntry.detail}`;
  }

  function boostWithNearbySupport(currentConfidence, winnerGenerator, sources) {
    const nearbyEntries = selectFromStage("stage4", sources, false);
    const hasNearbySupport = nearbyEntries.some((entry) => entry.generator === winnerGenerator);
    if (!hasNearbySupport) {
      return currentConfidence;
    }

    if (currentConfidence === "low") {
      return "medium";
    }
    if (currentConfidence === "medium") {
      return "high";
    }
    return currentConfidence;
  }

  function fallbackResult(reason) {
    return {
      generator: "genericText",
      confidence: "low",
      reason
    };
  }

  function selectFromStage(stageId, sources, allowPartial) {
    const entries = [];

    for (const sourceName of STAGE_ORDER.find((stage) => stage.id === stageId)?.sources || []) {
      const sourceText = sources[sourceName];
      if (!sourceText) continue;

      for (const intent of INTENTS) {
        const hit = detectIntentInSource(intent, sourceText, allowPartial);
        if (!hit) continue;

        const sourceWeight = SOURCE_WEIGHTS[sourceName]?.[hit.level] || 0;
        if (!sourceWeight) continue;

        entries.push({
          generator: intent.generator,
          source: sourceName,
          level: hit.level,
          stage: stageId,
          score: sourceWeight,
          detail: hit.reason
        });
      }
    }

    if (stageId === "stage5") {
      applyTypeStage(entries, sources);
    }

    return entries;
  }

  function suggestGeneratorForCapturedField(fieldMetadata, mode = "single") {
    const normalizedMode = mode === "bulk" ? "bulk" : "single";
    const sources = buildSources(fieldMetadata);

    for (const stage of STAGE_ORDER) {
      const entries = selectFromStage(stage.id, sources, stage.allowPartial);
      if (entries.length === 0) {
        continue;
      }

      const ranked = aggregateEntries(entries);
      const winner = ranked[0];
      const runnerUp = ranked[1] || null;
      let confidence = computeConfidence(stage.id, winner, runnerUp);
      if (stage.id === "stage2" || stage.id === "stage3") {
        confidence = boostWithNearbySupport(confidence, winner.generator, sources);
      }
      const reason = bestReason(winner);

      if (normalizedMode === "bulk" && confidence !== "high") {
        return fallbackResult(`Bulk mode requires high confidence (got ${confidence})`);
      }

      if (normalizedMode === "single" && confidence === "low") {
        return fallbackResult("Low-confidence suggestion in single mode");
      }

      return {
        generator: winner.generator,
        confidence,
        reason
      };
    }

    return fallbackResult("No semantic match found");
  }

  globalThis.ChaosFillGeneratorSuggestion = {
    suggestGeneratorForCapturedField
  };
})();
