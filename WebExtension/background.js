(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  const MENU_FILL_FIELD = "chaos-fill-fill-field";
  const MENU_FILL_FORM = "chaos-fill-fill-form";
  const MENU_ADD_FIELD_TO_CONFIG = "chaos-fill-add-field-to-config";
  const MENU_ADD_ALL_FIELDS_TO_CONFIG = "chaos-fill-add-all-fields-to-config";
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

  function sendMessageToTab(tabId, message, frameId) {
    return new Promise((resolve) => {
      if (!tabId) {
        resolve({ ok: false, reason: "missing-tab" });
        return;
      }

      const callback = (response) => {
        const error = api.runtime.lastError;
        if (error) {
          resolve({ ok: false, reason: error.message });
          return;
        }
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
    const settings = await globalThis.ChaosFillStorage.getSettings();

    return new Promise((resolve) => {
      api.contextMenus.removeAll(() => {
        if (settings.general.contextMenuEnabled === false) {
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

  function safeString(value) {
    return String(value || "").trim();
  }

  function normalizeForMatch(value) {
    return safeString(value).replace(/\s+/g, " ");
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
    if (id) {
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

    if (VAT_HINT_REGEX.test(searchText)) return { type: "vatId", outputMask: "DE#########" };
    if (fieldType === "email" || EMAIL_HINT_REGEX.test(searchText)) return { type: "email", outputMask: "" };
    if (fieldType === "tel" || PHONE_HINT_REGEX.test(searchText)) return { type: "phone", outputMask: "" };
    if (fieldType === "number" || NUMBER_HINT_REGEX.test(searchText)) return { type: "number", outputMask: "" };
    if (fieldType === "date") return { type: "date", outputMask: "" };
    if (fieldType === "datetime-local") return { type: "datetime-local", outputMask: "" };
    if (fieldType === "password" || /\b(password|passcode)\b/.test(searchText)) return { type: "password", outputMask: "" };
    if (IBAN_HINT_REGEX.test(searchText)) return { type: "iban", outputMask: "" };
    if (BIC_HINT_REGEX.test(searchText)) return { type: "bic", outputMask: "" };
    if (FIRST_NAME_HINT_REGEX.test(searchText)) return { type: "firstName", outputMask: "" };
    if (LAST_NAME_HINT_REGEX.test(searchText)) return { type: "lastName", outputMask: "" };
    if (COMPANY_HINT_REGEX.test(searchText)) return { type: "company", outputMask: "" };
    if (STREET_HINT_REGEX.test(searchText)) return { type: "street", outputMask: "" };
    if (CITY_HINT_REGEX.test(searchText)) return { type: "city", outputMask: "" };
    if (ZIP_HINT_REGEX.test(searchText)) return { type: "zip", outputMask: "" };
    if (COUNTRY_HINT_REGEX.test(searchText)) return { type: "country", outputMask: "" };
    if (FULL_NAME_HINT_REGEX.test(searchText)) return { type: "fullName", outputMask: "" };
    if (tagName === "textarea") return { type: "lorem", outputMask: "" };

    return { type: "lorem", outputMask: "" };
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
      d: safeString(rule?.domainRegex)
    });
  }

  async function appendRulesAndOpenOptions(candidateRules) {
    const settings = await globalThis.ChaosFillStorage.getSettings();
    const existingRules = Array.isArray(settings.rules) ? settings.rules : [];
    const existingSignatures = new Set(existingRules.map((rule) => ruleSignature(rule)));

    const newRules = [];
    for (const candidate of candidateRules) {
      if (!candidate) continue;
      const signature = ruleSignature(candidate);
      if (existingSignatures.has(signature)) continue;
      existingSignatures.add(signature);
      newRules.push(candidate);
    }

    if (newRules.length === 0) {
      await openOptionsPage();
      return;
    }

    settings.rules = [...newRules, ...existingRules];
    await globalThis.ChaosFillStorage.saveSettings(settings);
    await openOptionsPage();
  }

  function openOptionsPage() {
    return new Promise((resolve) => {
      api.runtime.openOptionsPage(() => {
        resolve();
      });
    });
  }

  async function addContextFieldToConfiguration(tabId, frameId) {
    const result = await sendMessageToTab(tabId, { type: "CHAOS_FILL_CAPTURE_CONTEXT_FIELD" }, frameId);
    if (!result.ok || !result.response?.ok || !result.response?.field) {
      return;
    }

    const newRule = buildRuleFromField(result.response.field);
    await appendRulesAndOpenOptions([newRule]);
  }

  async function addAllPageFieldsToConfiguration(tabId, frameId) {
    const result = await sendMessageToTab(tabId, { type: "CHAOS_FILL_CAPTURE_PAGE_FIELDS" }, frameId);
    if (!result.ok || !result.response?.ok || !Array.isArray(result.response?.fields)) {
      return;
    }

    const rules = result.response.fields.map((field) => buildRuleFromField(field)).filter(Boolean);
    await appendRulesAndOpenOptions(rules);
  }

  function registerToolbarClickHandler() {
    if (api.action?.onClicked) {
      api.action.onClicked.addListener((tab) => {
        sendMessageToTab(tab.id, { type: "CHAOS_FILL_FILL_BEST_FORM" });
      });
      return;
    }

    if (api.browserAction?.onClicked) {
      api.browserAction.onClicked.addListener((tab) => {
        sendMessageToTab(tab.id, { type: "CHAOS_FILL_FILL_BEST_FORM" });
      });
    }
  }

  api.runtime.onInstalled.addListener(() => {
    refreshContextMenus();
  });

  if (api.runtime.onStartup) {
    api.runtime.onStartup.addListener(() => {
      refreshContextMenus();
    });
  }

  registerToolbarClickHandler();

  api.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === MENU_FILL_FIELD) {
      sendMessageToTab(tab.id, { type: "CHAOS_FILL_FILL_CONTEXT_FIELD" }, info.frameId);
      return;
    }

    if (info.menuItemId === MENU_FILL_FORM) {
      sendMessageToTab(tab.id, { type: "CHAOS_FILL_FILL_CONTEXT_FORM" }, info.frameId);
      return;
    }

    if (info.menuItemId === MENU_ADD_FIELD_TO_CONFIG) {
      addContextFieldToConfiguration(tab.id, info.frameId);
      return;
    }

    if (info.menuItemId === MENU_ADD_ALL_FIELDS_TO_CONFIG) {
      addAllPageFieldsToConfiguration(tab.id, info.frameId);
    }
  });

  api.runtime.onMessage.addListener((message) => {
    if (message?.type === "CHAOS_FILL_SETTINGS_UPDATED") {
      refreshContextMenus();
    }
  });
})();
