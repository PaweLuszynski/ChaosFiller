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

  const BULK_SAFE_MEDIUM_GENERATORS = new Set([
    "firstName",
    "lastName",
    "email",
    "phone",
    "city",
    "postalCode",
    "country",
    "streetAddress1",
    "streetAddress2"
  ]);

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

  function shorten(value, max = 140) {
    const text = safeString(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  }

  function fieldSummary(fieldMetadata) {
    return {
      name: shorten(fieldMetadata?.name),
      id: shorten(fieldMetadata?.id),
      type: shorten(fieldMetadata?.type),
      tagName: shorten(fieldMetadata?.tagName),
      labelText: shorten(fieldMetadata?.labelText),
      placeholder: shorten(fieldMetadata?.placeholder),
      nearbyText: shorten(fieldMetadata?.nearbyText),
      ariaLabel: shorten(fieldMetadata?.ariaLabel),
      ariaLabelledbyText: shorten(fieldMetadata?.ariaLabelledbyText)
    };
  }

  function logSuggestion(tag, payload) {
    try {
      console.log(tag, JSON.stringify(payload));
    } catch (_error) {
      console.log(tag, payload);
    }
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

  function normalizeTokenForMatching(token) {
    const raw = safeString(token);
    if (!raw) return "";

    // Preserve short numeric tokens (1/2) to support address line detection,
    // but drop long numeric-only noise.
    if (/^\d+$/.test(raw)) {
      return raw.length <= 2 ? raw : "";
    }

    return raw
      .replace(/^\d{3,}/, "")
      .replace(/\d{4,}$/, "")
      .trim();
  }

  function tokenize(value) {
    return normalizeText(value)
      .split(" ")
      .map((token) => normalizeTokenForMatching(token))
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

  function buildSemanticSources(fieldMetadata) {
    return buildSources(fieldMetadata);
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

  function summarizeEntries(entries) {
    return entries
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => ({
        generator: entry.generator,
        source: entry.source,
        detail: entry.detail,
        level: entry.level,
        score: entry.score
      }));
  }

  function topEntryForWinner(winner) {
    return winner?.entries
      ?.slice()
      .sort((a, b) => b.score - a.score)?.[0] || null;
  }

  function isClearWinner(winner, runnerUp) {
    const winnerScore = Number(winner?.score || 0);
    const runnerScore = Number(runnerUp?.score || 0);
    return winnerScore - runnerScore >= 15;
  }

  function isBulkSafeMediumMatch(stageId, winner, runnerUp) {
    if (!winner || !BULK_SAFE_MEDIUM_GENERATORS.has(winner.generator)) {
      return false;
    }

    if (!["stage1", "stage2", "stage4"].includes(stageId)) {
      return false;
    }

    if (!isClearWinner(winner, runnerUp)) {
      return false;
    }

    const topEntry = topEntryForWinner(winner);
    if (!topEntry) return false;

    if (topEntry.level === "strong" && ["label", "ariaLabel", "ariaLabelledby", "placeholder", "nearbyText", "name"].includes(topEntry.source)) {
      return true;
    }

    if (topEntry.source === "name" && topEntry.level === "partial") {
      const detail = String(topEntry.detail || "");
      const hasMultiTokenHint = /\btokens\s+'[^']+\s+[^']+'/.test(detail);
      const addressLike = ["city", "postalCode", "country", "streetAddress1", "streetAddress2"].includes(winner.generator);
      return hasMultiTokenHint || addressLike;
    }

    return false;
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
    const sources = buildSemanticSources(fieldMetadata);
    if (normalizedMode === "bulk") {
      logSuggestion("GENERATOR_FIELD_SUMMARY", fieldSummary(fieldMetadata));
      logSuggestion("GENERATOR_SOURCES", sources);
    }

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
      const rawSuggestion = {
        generator: winner.generator,
        confidence,
        reason,
        stage: stage.id
      };
      logSuggestion("GENERATOR_RAW_SUGGESTION", rawSuggestion);
      logSuggestion("CONFIDENCE_CHECK", {
        mode: normalizedMode,
        stage: stage.id,
        confidence,
        winner: winner.generator,
        winnerScore: winner.score,
        runnerUp: runnerUp?.generator || null,
        runnerUpScore: runnerUp?.score || 0,
        topMatches: summarizeEntries(winner.entries)
      });

      const mediumIsSafeInBulk = confidence === "medium" && isBulkSafeMediumMatch(stage.id, winner, runnerUp);
      const bulkAccepts = confidence === "high" || mediumIsSafeInBulk;
      if (normalizedMode === "bulk" && !bulkAccepts) {
        const rejected = fallbackResult(`Bulk mode confidence rejected at ${stage.id} (${confidence})`);
        logSuggestion("BULK_CONFIDENCE_REJECT", {
          mode: normalizedMode,
          stage: stage.id,
          confidence,
          winner: winner.generator,
          reason,
          mediumSafeCandidate: BULK_SAFE_MEDIUM_GENERATORS.has(winner.generator),
          clearWinner: isClearWinner(winner, runnerUp),
          topEntry: topEntryForWinner(winner)
        });
        logSuggestion("GENERATOR_FINAL_SUGGESTION", rejected);
        return rejected;
      }

      if (normalizedMode === "single" && confidence === "low") {
        const rejected = fallbackResult("Low-confidence suggestion in single mode");
        logSuggestion("GENERATOR_FINAL_SUGGESTION", rejected);
        return rejected;
      }

      const accepted = {
        generator: winner.generator,
        confidence,
        reason
      };
      logSuggestion("GENERATOR_FINAL_SUGGESTION", accepted);
      return accepted;
    }

    const noMatch = fallbackResult("No semantic match found");
    logSuggestion("GENERATOR_FINAL_SUGGESTION", noMatch);
    return noMatch;
  }

  globalThis.ChaosFillGeneratorSuggestion = {
    suggestGeneratorForCapturedField
  };
})();
