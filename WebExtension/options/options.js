(() => {
  const api = globalThis.browser ?? globalThis.chrome;

  const GENERATOR_TYPES = [
    "firstName",
    "lastName",
    "fullName",
    "email",
    "number",
    "phone",
    "company",
    "street",
    "city",
    "zip",
    "country",
    "iban",
    "bic",
    "vatId",
    "password",
    "lorem",
    "date",
    "datetime-local",
    "randomized-list"
  ];
  const MATCH_TARGETS = [
    { value: "any", label: "Any selected attributes (bundle)" },
    { value: "id", label: "id" },
    { value: "name", label: "name" },
    { value: "placeholder", label: "placeholder" },
    { value: "label", label: "label text" },
    { value: "ariaLabel", label: "aria-label" },
    { value: "ariaLabelledby", label: "aria-labelledby text" },
    { value: "class", label: "class" },
    { value: "type", label: "type" }
  ];
  const RULE_FIELD_HELP = {
    title: "Optional display name for this rule.",
    generator: "What fake value to generate. Example: choose vatId for tax identifiers.",
    matchKind: "How to compare your pattern. contains = partial text, equals = exact text, regex = pattern like ^(vendor|company)\\.salesTaxId$.",
    matchTarget: "Which field attribute to inspect. Example: choose id to match only the field id.",
    matchPattern: "Pattern to match against the selected target. Multiple options: option a; option b. Optional per-option target: id:value; name:value; placeholder:value.",
    outputMask: "Optional output format. Tokens: # digit, A uppercase letter, a lowercase letter, X letter/digit, ? any source character. Example: DE#########.",
    domainRegex: "Optional domain filter for this rule. Leave empty to apply on all domains.",
    enabled: "Turn this rule on or off without deleting it.",
    randomizedList: "Used only when generator is randomized-list. Enter values separated by comma or new line."
  };

  let settingsState = null;
  let toastTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function showStatus(message, isError = false) {
    const toast = $("toast");
    const toastMessage = $("toastMessage");
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.hidden = false;
    toast.classList.remove("toast-success", "toast-error", "is-visible");
    toast.classList.add(isError ? "toast-error" : "toast-success");

    // Re-trigger transition on repeated updates.
    // eslint-disable-next-line no-unused-expressions
    toast.offsetWidth;
    toast.classList.add("is-visible");

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      hideStatus();
    }, 5000);
  }

  function hideStatus() {
    const toast = $("toast");
    if (!toast) return;

    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    toast.classList.remove("is-visible");
    setTimeout(() => {
      toast.hidden = true;
    }, 170);
  }

  function joinLines(values) {
    return (Array.isArray(values) ? values : []).join("\n");
  }

  function readLines(value) {
    return String(value || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function readTokenList(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function validateRegexList(values, label) {
    for (const raw of values) {
      if (!raw) continue;
      try {
        // eslint-disable-next-line no-new
        new RegExp(raw, "i");
      } catch (error) {
        throw new Error(`Invalid ${label} regex: ${raw}`);
      }
    }
  }

  function splitPatternOptions(value) {
    return String(value || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function extractPatternOptionBody(value) {
    const raw = String(value || "").trim();
    const prefixedMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*[:=]\s*(.+)$/);
    if (!prefixedMatch) {
      return raw;
    }
    return String(prefixedMatch[2] || "").trim();
  }

  function createRuleTemplate() {
    return {
      id: globalThis.ChaosFillStorage.createRuleId(),
      title: "New Rule",
      generator: { type: "lorem", items: [] },
      match: { kind: "contains", pattern: "", target: "any" },
      outputMask: "",
      domainRegex: "",
      enabled: true
    };
  }

  function helperIcon(text) {
    const escaped = escapeHtml(text);
    return `<span class="help-icon" tabindex="0" role="button" aria-label="${escaped}" data-help="${escaped}">i</span>`;
  }

  function renderRules() {
    const root = $("rulesList");
    root.innerHTML = "";

    settingsState.rules.forEach((rule, index) => {
      const card = document.createElement("article");
      card.className = "rule-card";

      const titleRow = document.createElement("div");
      titleRow.className = "rule-grid";
      titleRow.innerHTML = `
        <label>
          <span class="label-title">Rule title ${helperIcon(RULE_FIELD_HELP.title)}</span>
          <input type="text" data-role="title" value="${escapeHtml(rule.title || "")}" />
        </label>
        <label>
          <span class="label-title">Generator ${helperIcon(RULE_FIELD_HELP.generator)}</span>
          <select data-role="generator"></select>
        </label>
        <label>
          <span class="label-title">Match type ${helperIcon(RULE_FIELD_HELP.matchKind)}</span>
          <select data-role="match-kind">
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="regex">regex</option>
          </select>
        </label>
        <label>
          <span class="label-title">Match target ${helperIcon(RULE_FIELD_HELP.matchTarget)}</span>
          <select data-role="match-target"></select>
        </label>
        <label>
          <span class="label-title">Match pattern ${helperIcon(RULE_FIELD_HELP.matchPattern)}</span>
          <input type="text" data-role="match-pattern" value="${escapeHtml(rule.match?.pattern || "")}" />
        </label>
        <label>
          <span class="label-title">Output mask (optional) ${helperIcon(RULE_FIELD_HELP.outputMask)}</span>
          <input type="text" data-role="output-mask" value="${escapeHtml(rule.outputMask || "")}" />
        </label>
        <label>
          <span class="label-title">Domain regex (optional) ${helperIcon(RULE_FIELD_HELP.domainRegex)}</span>
          <input type="text" data-role="domain-regex" value="${escapeHtml(rule.domainRegex || "")}" />
        </label>
        <label class="inline-option">
          <input type="checkbox" data-role="enabled" ${rule.enabled !== false ? "checked" : ""} />
          <span class="label-title">Enabled ${helperIcon(RULE_FIELD_HELP.enabled)}</span>
        </label>
      `;

      const generatorSelect = titleRow.querySelector('[data-role="generator"]');
      GENERATOR_TYPES.forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        generatorSelect.appendChild(option);
      });
      generatorSelect.value = rule.generator?.type || "lorem";

      const matchKind = titleRow.querySelector('[data-role="match-kind"]');
      matchKind.value = rule.match?.kind || "contains";
      const matchTarget = titleRow.querySelector('[data-role="match-target"]');
      MATCH_TARGETS.forEach((target) => {
        const option = document.createElement("option");
        option.value = target.value;
        option.textContent = target.label;
        matchTarget.appendChild(option);
      });
      matchTarget.value = rule.match?.target || "any";

      const listLabel = document.createElement("label");
      listLabel.innerHTML = `
        <span class="label-title">Randomized list values (comma/newline separated) ${helperIcon(RULE_FIELD_HELP.randomizedList)}</span>
        <textarea data-role="list-items" rows="3"></textarea>
      `;
      const listArea = listLabel.querySelector("textarea");
      listArea.value = (rule.generator?.items || []).join("\n");
      listLabel.style.display = (rule.generator?.type === "randomized-list") ? "grid" : "none";

      const actions = document.createElement("div");
      actions.className = "rule-actions";
      actions.innerHTML = `
        <button data-role="up">Move up</button>
        <button data-role="down">Move down</button>
        <button data-role="delete">Delete</button>
      `;

      card.appendChild(titleRow);
      card.appendChild(listLabel);
      card.appendChild(actions);
      root.appendChild(card);

      titleRow.querySelector('[data-role="title"]').addEventListener("input", (event) => {
        rule.title = event.target.value;
      });

      generatorSelect.addEventListener("change", (event) => {
        rule.generator.type = event.target.value;
        if (rule.generator.type !== "randomized-list") {
          rule.generator.items = [];
        }
        renderRules();
      });

      matchKind.addEventListener("change", (event) => {
        rule.match.kind = event.target.value;
      });

      matchTarget.addEventListener("change", (event) => {
        rule.match.target = event.target.value;
      });

      titleRow.querySelector('[data-role="match-pattern"]').addEventListener("input", (event) => {
        rule.match.pattern = event.target.value;
      });

      titleRow.querySelector('[data-role="output-mask"]').addEventListener("input", (event) => {
        rule.outputMask = event.target.value;
      });

      titleRow.querySelector('[data-role="domain-regex"]').addEventListener("input", (event) => {
        rule.domainRegex = event.target.value;
      });

      titleRow.querySelector('[data-role="enabled"]').addEventListener("change", (event) => {
        rule.enabled = event.target.checked;
      });

      listArea.addEventListener("input", (event) => {
        rule.generator.items = String(event.target.value)
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean);
      });

      actions.querySelector('[data-role="up"]').addEventListener("click", () => {
        if (index === 0) return;
        const [item] = settingsState.rules.splice(index, 1);
        settingsState.rules.splice(index - 1, 0, item);
        renderRules();
      });

      actions.querySelector('[data-role="down"]').addEventListener("click", () => {
        if (index >= settingsState.rules.length - 1) return;
        const [item] = settingsState.rules.splice(index, 1);
        settingsState.rules.splice(index + 1, 0, item);
        renderRules();
      });

      actions.querySelector('[data-role="delete"]').addEventListener("click", () => {
        settingsState.rules.splice(index, 1);
        renderRules();
      });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bindStaticFieldsFromState() {
    const settings = settingsState;

    $("passwordModeFixed").checked = settings.password.mode === "fixed";
    $("passwordModeRandom").checked = settings.password.mode === "random";
    $("passwordFixedValue").value = settings.password.fixedValue || "";
    $("passwordRandomLength").value = settings.password.randomLength;

    $("ignoreMatchTokens").value = joinLines(settings.general.ignoreMatchTokens);
    $("ignoreHiddenInvisible").checked = settings.general.ignoreHiddenInvisible !== false;
    $("ignoreExistingContent").checked = settings.general.ignoreExistingContent === true;
    $("confirmationTokens").value = joinLines(settings.general.confirmationTokens);
    $("agreeTokens").value = joinLines(settings.general.agreeTokens);

    $("attrId").checked = settings.general.useAttributes.id !== false;
    $("attrName").checked = settings.general.useAttributes.name !== false;
    $("attrLabel").checked = settings.general.useAttributes.label !== false;
    $("attrAriaLabel").checked = settings.general.useAttributes.ariaLabel !== false;
    $("attrAriaLabelledby").checked = settings.general.useAttributes.ariaLabelledby !== false;
    $("attrPlaceholder").checked = settings.general.useAttributes.placeholder !== false;
    $("attrClass").checked = settings.general.useAttributes.class === true;
    $("attrType").checked = settings.general.useAttributes.type !== false;

    $("triggerEvents").checked = settings.general.triggerEvents !== false;
    $("contextMenuEnabled").checked = settings.general.contextMenuEnabled !== false;
    $("ignoredDomains").value = joinLines(settings.general.ignoredDomains);
    $("enableSensitiveDenylist").checked = settings.general.enableSensitiveDenylist !== false;

    $("maxLength").value = settings.fallback.maxLength;
    $("loremMaxWords").value = settings.fallback.loremMaxWords;
    $("emailDomain").value = settings.fallback.emailDomain || "example.com";
    $("phoneFormat").value = settings.fallback.phoneFormat || "+49###########";
    $("dateStart").value = settings.fallback.dateStart;
    $("dateEnd").value = settings.fallback.dateEnd;
    $("checkboxDefault").value = settings.fallback.checkboxDefault;
    $("radioStrategy").value = settings.fallback.radioStrategy;
  }

  function syncStateFromStaticFields() {
    settingsState.password.mode = $("passwordModeRandom").checked ? "random" : "fixed";
    settingsState.password.fixedValue = $("passwordFixedValue").value;
    settingsState.password.randomLength = Number($("passwordRandomLength").value || 16);

    settingsState.general.ignoreMatchTokens = readTokenList($("ignoreMatchTokens").value);
    settingsState.general.ignoreHiddenInvisible = $("ignoreHiddenInvisible").checked;
    settingsState.general.ignoreExistingContent = $("ignoreExistingContent").checked;
    settingsState.general.confirmationTokens = readTokenList($("confirmationTokens").value);
    settingsState.general.agreeTokens = readTokenList($("agreeTokens").value);

    settingsState.general.useAttributes.id = $("attrId").checked;
    settingsState.general.useAttributes.name = $("attrName").checked;
    settingsState.general.useAttributes.label = $("attrLabel").checked;
    settingsState.general.useAttributes.ariaLabel = $("attrAriaLabel").checked;
    settingsState.general.useAttributes.ariaLabelledby = $("attrAriaLabelledby").checked;
    settingsState.general.useAttributes.placeholder = $("attrPlaceholder").checked;
    settingsState.general.useAttributes.class = $("attrClass").checked;
    settingsState.general.useAttributes.type = $("attrType").checked;

    settingsState.general.triggerEvents = $("triggerEvents").checked;
    settingsState.general.contextMenuEnabled = $("contextMenuEnabled").checked;
    settingsState.general.ignoredDomains = readLines($("ignoredDomains").value);
    settingsState.general.enableSensitiveDenylist = $("enableSensitiveDenylist").checked;

    settingsState.fallback.maxLength = Number($("maxLength").value || 20);
    settingsState.fallback.loremMaxWords = Number($("loremMaxWords").value || 6);
    settingsState.fallback.emailDomain = $("emailDomain").value;
    settingsState.fallback.phoneFormat = $("phoneFormat").value;
    settingsState.fallback.dateStart = $("dateStart").value;
    settingsState.fallback.dateEnd = $("dateEnd").value;
    settingsState.fallback.checkboxDefault = $("checkboxDefault").value;
    settingsState.fallback.radioStrategy = $("radioStrategy").value;
  }

  async function notifyBackgroundSettingsChanged() {
    try {
      await api.runtime.sendMessage({ type: "CHAOS_FILL_SETTINGS_UPDATED" });
    } catch (_error) {
      // Ignore if background is not available in this context.
    }
  }

  async function saveSettings() {
    syncStateFromStaticFields();

    validateRegexList(settingsState.general.ignoredDomains, "ignored domain");

    for (const rule of settingsState.rules) {
      if (rule.match.kind === "regex" && rule.match.pattern) {
        validateRegexList(
          splitPatternOptions(rule.match.pattern).map((entry) => extractPatternOptionBody(entry)),
          `rule '${rule.title || rule.id}'`
        );
      }
      if (rule.domainRegex) {
        validateRegexList([rule.domainRegex], `rule '${rule.title || rule.id}' domain`);
      }
    }

    settingsState = await globalThis.ChaosFillStorage.saveSettings(settingsState);
    await notifyBackgroundSettingsChanged();
    showStatus("Settings saved");
  }

  async function resetSettings() {
    settingsState = await globalThis.ChaosFillStorage.resetSettings();
    bindStaticFieldsFromState();
    renderRules();
    await notifyBackgroundSettingsChanged();
    showStatus("Defaults restored.");
  }

  async function exportSettings() {
    const json = await globalThis.ChaosFillStorage.exportSettings();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "chaos-fill-settings.json";
    link.click();

    URL.revokeObjectURL(url);
    showStatus("Settings exported.");
  }

  async function importSettingsFromFile(file) {
    const text = await file.text();
    settingsState = await globalThis.ChaosFillStorage.importSettings(text);
    bindStaticFieldsFromState();
    renderRules();
    await notifyBackgroundSettingsChanged();
    showStatus("Settings imported.");
  }

  async function init() {
    settingsState = await globalThis.ChaosFillStorage.getSettings();
    bindStaticFieldsFromState();
    renderRules();

    document.addEventListener("click", (event) => {
      const helpIcon = event.target.closest(".help-icon");
      if (!helpIcon) return;
      event.preventDefault();
      event.stopPropagation();
      helpIcon.focus();
    });

    $("toastClose").addEventListener("click", () => {
      hideStatus();
    });

    $("addRuleBtn").addEventListener("click", () => {
      settingsState.rules.push(createRuleTemplate());
      renderRules();
    });

    $("saveBtn").addEventListener("click", async () => {
      try {
        await saveSettings();
      } catch (error) {
        showStatus(String(error.message || error), true);
      }
    });

    $("resetBtn").addEventListener("click", async () => {
      try {
        await resetSettings();
      } catch (error) {
        showStatus(String(error.message || error), true);
      }
    });

    $("exportBtn").addEventListener("click", async () => {
      try {
        await exportSettings();
      } catch (error) {
        showStatus(String(error.message || error), true);
      }
    });

    $("importBtn").addEventListener("click", () => {
      $("importFile").click();
    });

    $("importFile").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await importSettingsFromFile(file);
      } catch (error) {
        showStatus(String(error.message || error), true);
      } finally {
        event.target.value = "";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => showStatus(String(error.message || error), true));
  });
})();
