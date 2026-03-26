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

  const uiState = {
    domainsExpanded: false,
    expandedDomains: new Set(),
    activeTarget: "section-general",
    fixedRows: {},
    toastTimer: null
  };

  let appState = null;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeId(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function sectionIdForDomain(domainKey) {
    return `section-domain-${safeId(domainKey)}`;
  }

  function sectionIdForDomainPart(domainKey, part) {
    return `${sectionIdForDomain(domainKey)}-${part}`;
  }

  function sectionIdForRule(scope, domainKey, ruleId) {
    if (scope === "global") {
      return `section-global-rule-${safeId(ruleId)}`;
    }
    return `${sectionIdForDomain(domainKey)}-rule-${safeId(ruleId)}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getDomainsSorted() {
    return Object.values(appState.domains || {}).sort((a, b) => a.label.localeCompare(b.label));
  }

  function getDomain(domainKey) {
    return appState.domains?.[domainKey] || null;
  }

  function ensureFixedRows(domainKey) {
    if (uiState.fixedRows[domainKey]) {
      return uiState.fixedRows[domainKey];
    }

    const domain = getDomain(domainKey);
    const rows = [];
    const fixedValues = domain?.fixedValues || {};

    for (const [key, value] of Object.entries(fixedValues)) {
      rows.push({ id: `${Date.now()}-${Math.random()}`, key: String(key), value: String(value) });
    }

    if (rows.length === 0) {
      rows.push({ id: `${Date.now()}-${Math.random()}`, key: "", value: "" });
    }

    uiState.fixedRows[domainKey] = rows;
    return rows;
  }

  function syncFixedRowsToState() {
    for (const domainKey of Object.keys(appState.domains || {})) {
      const rows = ensureFixedRows(domainKey);
      const fixedValues = {};
      for (const row of rows) {
        const key = String(row.key || "").trim();
        if (!key) continue;
        fixedValues[key] = String(row.value ?? "");
      }
      appState.domains[domainKey].fixedValues = fixedValues;
      appState.domains[domainKey].updatedAt = Date.now();
    }
  }

  function initFixedRowsFromState() {
    uiState.fixedRows = {};
    for (const domainKey of Object.keys(appState.domains || {})) {
      ensureFixedRows(domainKey);
    }
  }

  function showStatus(message, isError = false) {
    const toast = $("toast");
    const toastMessage = $("toastMessage");
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.hidden = false;
    toast.classList.add("is-visible");
    toast.classList.toggle("toast-error", isError);

    if (uiState.toastTimer) {
      clearTimeout(uiState.toastTimer);
    }
    uiState.toastTimer = setTimeout(() => {
      hideStatus();
    }, 5000);
  }

  function hideStatus() {
    const toast = $("toast");
    if (!toast) return;

    if (uiState.toastTimer) {
      clearTimeout(uiState.toastTimer);
      uiState.toastTimer = null;
    }

    toast.classList.remove("is-visible");
    toast.hidden = true;
  }

  function setByPath(target, path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (parts.length === 0) return;

    let current = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index];
      if (!current[key] || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }

    current[parts[parts.length - 1]] = value;
  }

  function createRuleTemplate() {
    return {
      id: globalThis.ChaosFillStorage.createRuleId(),
      title: "New Rule",
      generator: { type: "lorem", items: [] },
      match: { kind: "contains", pattern: "", target: "any" },
      outputMask: "",
      domainRegex: "",
      resolvedKey: "",
      overrideEnabled: false,
      overrideValue: "",
      enabled: true
    };
  }

  function ruleOverrideEnabled(rule) {
    if (typeof rule?.overrideEnabled === "boolean") {
      return rule.overrideEnabled;
    }
    return typeof rule?.overrideValue === "string" && rule.overrideValue.length > 0;
  }

  function ruleFieldValue(rule, field) {
    switch (field) {
      case "title":
        return rule.title;
      case "enabled":
        return rule.enabled !== false;
      case "generator.type":
        return rule.generator?.type || "lorem";
      case "generator.items":
        return Array.isArray(rule.generator?.items) ? rule.generator.items.join("\n") : "";
      case "match.kind":
        return rule.match?.kind || "contains";
      case "match.pattern":
        return rule.match?.pattern || "";
      case "match.target":
        return rule.match?.target || "any";
      case "outputMask":
        return rule.outputMask || "";
      case "domainRegex":
        return rule.domainRegex || "";
      case "resolvedKey":
        return rule.resolvedKey || "";
      case "overrideEnabled":
        return ruleOverrideEnabled(rule);
      case "overrideValue":
        return rule.overrideValue || "";
      default:
        return "";
    }
  }

  function setRuleField(rule, field, rawValue, isCheckbox = false) {
    const value = isCheckbox ? rawValue === true : rawValue;

    switch (field) {
      case "title":
        rule.title = String(value || "");
        return;
      case "enabled":
        rule.enabled = Boolean(value);
        return;
      case "generator.type":
        rule.generator = rule.generator || { type: "lorem", items: [] };
        rule.generator.type = String(value || "lorem");
        if (rule.generator.type !== "randomized-list") {
          rule.generator.items = [];
        }
        return;
      case "generator.items":
        rule.generator = rule.generator || { type: "lorem", items: [] };
        rule.generator.items = String(value || "")
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean);
        return;
      case "match.kind":
        rule.match = rule.match || { kind: "contains", pattern: "", target: "any" };
        rule.match.kind = String(value || "contains");
        return;
      case "match.pattern":
        rule.match = rule.match || { kind: "contains", pattern: "", target: "any" };
        rule.match.pattern = String(value || "");
        return;
      case "match.target":
        rule.match = rule.match || { kind: "contains", pattern: "", target: "any" };
        rule.match.target = String(value || "any");
        return;
      case "outputMask":
        rule.outputMask = String(value || "");
        return;
      case "domainRegex":
        rule.domainRegex = String(value || "");
        return;
      case "resolvedKey":
        rule.resolvedKey = String(value || "");
        return;
      case "overrideEnabled":
        rule.overrideEnabled = Boolean(value);
        return;
      case "overrideValue":
        rule.overrideValue = String(value || "");
        return;
      default:
        break;
    }
  }

  function renderRuleCard(rule, options = {}) {
    const scope = options.scope || "global";
    const domainKey = options.domainKey || "";
    const sectionId = options.sectionId || "";

    const generatorType = ruleFieldValue(rule, "generator.type");
    const randomizedItems = ruleFieldValue(rule, "generator.items");

    return `
      <article class="rule-card section-anchor" id="${sectionId}">
        <div class="field-grid">
          <label>Rule title
            <input data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="title" value="${escapeHtml(ruleFieldValue(rule, "title"))}" />
          </label>
          <label>Generator
            <select data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="generator.type">
              ${GENERATOR_TYPES.map((type) => `<option value="${type}" ${generatorType === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
          </label>
          <label>Match type
            <select data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="match.kind">
              <option value="contains" ${ruleFieldValue(rule, "match.kind") === "contains" ? "selected" : ""}>contains</option>
              <option value="equals" ${ruleFieldValue(rule, "match.kind") === "equals" ? "selected" : ""}>equals</option>
              <option value="regex" ${ruleFieldValue(rule, "match.kind") === "regex" ? "selected" : ""}>regex</option>
            </select>
          </label>
          <label>Match target
            <select data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="match.target">
              ${globalThis.ChaosFillStorage.RULE_MATCH_TARGETS.map((target) => `<option value="${target}" ${ruleFieldValue(rule, "match.target") === target ? "selected" : ""}>${target}</option>`).join("")}
            </select>
          </label>
          <label>Match pattern
            <input data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="match.pattern" value="${escapeHtml(ruleFieldValue(rule, "match.pattern"))}" />
          </label>
          <label>Resolved key
            <input data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="resolvedKey" value="${escapeHtml(ruleFieldValue(rule, "resolvedKey"))}" />
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="overrideEnabled" ${ruleFieldValue(rule, "overrideEnabled") ? "checked" : ""} />
            Enable fixed value for this rule
          </label>
          <label>Fixed value (optional)
            <input data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="overrideValue" value="${escapeHtml(ruleFieldValue(rule, "overrideValue"))}" ${ruleFieldValue(rule, "overrideEnabled") ? "" : "disabled"} />
          </label>
          <label>Output mask
            <input data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="outputMask" value="${escapeHtml(ruleFieldValue(rule, "outputMask"))}" />
          </label>
          <label>Domain regex (optional)
            <input data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="domainRegex" value="${escapeHtml(ruleFieldValue(rule, "domainRegex"))}" />
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="enabled" ${ruleFieldValue(rule, "enabled") ? "checked" : ""} />
            Enabled
          </label>
        </div>

        ${generatorType === "randomized-list" ? `
          <label>Randomized list values (comma/newline)
            <textarea data-kind="rule-field" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}" data-field="generator.items">${escapeHtml(randomizedItems)}</textarea>
          </label>
        ` : ""}

        <div class="rule-actions">
          <button data-action="rule-up" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}">Move up</button>
          <button data-action="rule-down" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}">Move down</button>
          <button data-action="rule-delete" data-scope="${scope}" data-domain="${escapeHtml(domainKey)}" data-rule-id="${escapeHtml(rule.id)}">Delete</button>
        </div>
      </article>
    `;
  }

  function renderSidebar() {
    const sidebar = $("sidebar");
    const domains = getDomainsSorted();
    const domainsOpen = uiState.domainsExpanded;

    let html = `
      <p class="sidebar-title">Navigation</p>
      <button class="nav-item ${uiState.activeTarget === "section-general" ? "is-active" : ""}" data-nav-target="section-general">General Settings</button>
      <button class="nav-item ${uiState.activeTarget === "section-global-rules" ? "is-active" : ""}" data-nav-target="section-global-rules">Global Rules</button>
      <button class="nav-item ${uiState.activeTarget.startsWith("section-domain-") ? "is-active" : ""}" data-action="toggle-domains">Domains</button>
    `;

    if (domainsOpen) {
      html += `<div class="domain-children">`;
      if (domains.length === 0) {
        html += `<div class="muted">No domains yet</div>`;
      } else {
        for (const domain of domains) {
          const domainSectionId = sectionIdForDomain(domain.id);
          const domainExpanded = uiState.expandedDomains.has(domain.id);
          const domainRules = Array.isArray(domain.rules) ? domain.rules : [];

          html += `
            <button class="domain-toggle ${uiState.activeTarget.startsWith(domainSectionId) ? "is-active" : ""}" data-action="toggle-domain" data-domain-key="${escapeHtml(domain.id)}">
              ${escapeHtml(domain.label)}
            </button>
          `;

          if (domainExpanded) {
            html += `<div class="domain-children">`;
            if (domainRules.length === 0) {
              html += `<div class="muted">No rules</div>`;
            } else {
              for (const rule of domainRules) {
                const ruleSectionId = sectionIdForRule("domain", domain.id, rule.id);
                html += `
                  <button class="nav-child ${uiState.activeTarget === ruleSectionId ? "is-active" : ""}" data-nav-target="${ruleSectionId}" data-domain-key="${escapeHtml(domain.id)}">
                    ${escapeHtml(rule.title || rule.id)}
                  </button>
                `;
              }
            }
            html += `</div>`;
          }
        }
      }
      html += `</div>`;
    }

    sidebar.innerHTML = html;
  }

  function renderGeneralPanel() {
    const settings = appState.settings || {};

    return `
      <section class="panel section-anchor" id="section-general">
        <h2>General Settings</h2>
        <div class="field-grid">
          <label>Global data mode
            <select data-kind="setting" data-path="dataMode">
              <option value="random" ${settings.dataMode === "random" ? "selected" : ""}>random</option>
              <option value="session" ${settings.dataMode === "session" ? "selected" : ""}>session</option>
              <option value="persona" ${settings.dataMode === "persona" ? "selected" : ""}>persona</option>
            </select>
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="setting" data-path="personaFallbackToGenerated" ${settings.personaFallbackToGenerated !== false ? "checked" : ""} />
            Persona mode fallback to generated values
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="setting" data-path="triggerEvents" ${settings.triggerEvents !== false ? "checked" : ""} />
            Trigger input/change events
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="setting" data-path="contextMenuEnabled" ${settings.contextMenuEnabled !== false ? "checked" : ""} />
            Enable context menu
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="setting" data-path="sensitiveDenylistEnabled" ${settings.sensitiveDenylistEnabled !== false ? "checked" : ""} />
            Sensitive denylist enabled
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="setting" data-path="ignoreHiddenInvisible" ${settings.ignoreHiddenInvisible !== false ? "checked" : ""} />
            Ignore hidden/invisible
          </label>
          <label class="inline">
            <input type="checkbox" data-kind="setting" data-path="ignoreExistingContent" ${settings.ignoreExistingContent === true ? "checked" : ""} />
            Ignore already filled fields
          </label>
          <label>Password mode
            <select data-kind="setting" data-path="password.mode">
              <option value="fixed" ${settings.password?.mode === "fixed" ? "selected" : ""}>fixed</option>
              <option value="random" ${settings.password?.mode === "random" ? "selected" : ""}>random</option>
            </select>
          </label>
          <label>Fixed password value
            <input data-kind="setting" data-path="password.fixedValue" value="${escapeHtml(settings.password?.fixedValue || "")}" />
          </label>
          <label>Random password length
            <input type="number" min="4" max="128" data-kind="setting" data-path="password.randomLength" value="${escapeHtml(settings.password?.randomLength || 16)}" />
          </label>
          <label>Email domain
            <input data-kind="setting" data-path="fallback.emailDomain" value="${escapeHtml(settings.fallback?.emailDomain || "example.com")}" />
          </label>
          <label>Max fallback length
            <input type="number" min="1" max="1024" data-kind="setting" data-path="fallback.maxLength" value="${escapeHtml(settings.fallback?.maxLength || 20)}" />
          </label>
          <label>Lorem max words
            <input type="number" min="1" max="100" data-kind="setting" data-path="fallback.loremMaxWords" value="${escapeHtml(settings.fallback?.loremMaxWords || 6)}" />
          </label>
        </div>

        <label>Ignored domains (regex per line)
          <textarea data-kind="setting" data-path="ignoredDomains">${escapeHtml((settings.ignoredDomains || []).join("\n"))}</textarea>
        </label>
      </section>
    `;
  }

  function renderGlobalRulesPanel() {
    const rules = Array.isArray(appState.globalRules) ? appState.globalRules : [];

    return `
      <section class="panel section-anchor" id="section-global-rules">
        <h2>Global Rules</h2>
        <p class="muted">Global rules are fallback rules used when no domain-specific rule matches.</p>
        <button data-action="add-global-rule">Add global rule</button>
        <div class="section-stack">
          ${rules.map((rule) => renderRuleCard(rule, {
            scope: "global",
            sectionId: sectionIdForRule("global", "", rule.id)
          })).join("")}
        </div>
      </section>
    `;
  }

  function renderDomainPanel(domain) {
    const overviewId = sectionIdForDomainPart(domain.id, "overview");
    const rulesId = sectionIdForDomainPart(domain.id, "rules");
    const domainSection = sectionIdForDomain(domain.id);

    const rules = Array.isArray(domain.rules) ? domain.rules : [];

    return `
      <section class="panel section-anchor" id="${domainSection}">
        <h2>${escapeHtml(domain.label)}</h2>

        <section class="section-anchor" id="${overviewId}">
          <h3>Domain Overview</h3>
          <div class="field-grid">
            <label class="inline">
              <input type="checkbox" data-kind="domain-field" data-domain="${escapeHtml(domain.id)}" data-field="enabled" ${domain.enabled !== false ? "checked" : ""} />
              Enabled
            </label>
            <label>Display label
              <input data-kind="domain-field" data-domain="${escapeHtml(domain.id)}" data-field="label" value="${escapeHtml(domain.label)}" />
            </label>
            <label>Normalized domain
              <input value="${escapeHtml(domain.id)}" readonly />
            </label>
            <label>Domain data mode
              <select data-kind="domain-field" data-domain="${escapeHtml(domain.id)}" data-field="dataMode">
                <option value="inherit" ${domain.dataMode === "inherit" ? "selected" : ""}>inherit global</option>
                <option value="random" ${domain.dataMode === "random" ? "selected" : ""}>random</option>
                <option value="session" ${domain.dataMode === "session" ? "selected" : ""}>session</option>
                <option value="persona" ${domain.dataMode === "persona" ? "selected" : ""}>persona</option>
              </select>
            </label>
            <label>Created at
              <input value="${escapeHtml(new Date(domain.createdAt).toLocaleString())}" readonly />
            </label>
            <label>Updated at
              <input value="${escapeHtml(new Date(domain.updatedAt).toLocaleString())}" readonly />
            </label>
          </div>
          <div class="rule-actions">
            <button data-action="remove-domain" data-domain="${escapeHtml(domain.id)}">Remove Domain</button>
          </div>
          <label>Notes
            <textarea data-kind="domain-field" data-domain="${escapeHtml(domain.id)}" data-field="notes">${escapeHtml(domain.notes || "")}</textarea>
          </label>
        </section>

        <section class="section-anchor" id="${rulesId}">
          <h3>Domain Rules</h3>
          <button data-action="add-domain-rule" data-domain="${escapeHtml(domain.id)}">Add domain rule</button>
          <div class="section-stack">
            ${rules.map((rule) => renderRuleCard(rule, {
              scope: "domain",
              domainKey: domain.id,
              sectionId: sectionIdForRule("domain", domain.id, rule.id)
            })).join("")}
          </div>
        </section>
      </section>
    `;
  }

  function renderMainContent() {
    let html = "";
    if (uiState.activeTarget === "section-general") {
      html = renderGeneralPanel();
    } else if (uiState.activeTarget === "section-global-rules") {
      html = renderGlobalRulesPanel();
    } else if (uiState.activeTarget.startsWith("section-domain-")) {
      const domainKey = findDomainForTarget(uiState.activeTarget);
      const domain = getDomain(domainKey);
      if (domain) {
        html = renderDomainPanel(domain);
      } else {
        html = `
          <section class="panel">
            <h2>Domain not found</h2>
            <p class="muted">This domain was removed or is no longer available.</p>
          </section>
        `;
      }
    } else {
      html = renderGeneralPanel();
      uiState.activeTarget = "section-general";
    }

    $("mainContent").innerHTML = html;
  }

  function render() {
    renderSidebar();
    renderMainContent();
  }

  function findDomainForTarget(targetId) {
    if (!targetId) return "";
    const domains = getDomainsSorted();
    for (const domain of domains) {
      const prefix = sectionIdForDomain(domain.id);
      if (targetId === prefix || targetId.startsWith(`${prefix}-`)) {
        return domain.id;
      }
    }
    return "";
  }

  function navigateTo(targetId) {
    uiState.activeTarget = targetId;
    globalThis.location.hash = targetId;
    renderMainContent();
    renderSidebar();
  }

  function moveRule(list, ruleId, direction) {
    const index = list.findIndex((rule) => rule.id === ruleId);
    if (index < 0) return;

    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= list.length) return;

    const [item] = list.splice(index, 1);
    list.splice(nextIndex, 0, item);
  }

  function getRuleList(scope, domainKey) {
    if (scope === "global") {
      appState.globalRules = Array.isArray(appState.globalRules) ? appState.globalRules : [];
      return appState.globalRules;
    }

    const domain = getDomain(domainKey);
    if (!domain) return [];
    domain.rules = Array.isArray(domain.rules) ? domain.rules : [];
    domain.updatedAt = Date.now();
    return domain.rules;
  }

  function parseRegexOptions(pattern) {
    return String(pattern || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((entry) => {
        const prefixed = entry.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*[:=]\s*(.+)$/);
        return prefixed ? prefixed[2].trim() : entry;
      });
  }

  function validateRegexRules(rules, label) {
    for (const rule of rules) {
      if (!rule || rule.match?.kind !== "regex") continue;
      const options = parseRegexOptions(rule.match?.pattern);
      for (const pattern of options) {
        if (!pattern) continue;
        try {
          // eslint-disable-next-line no-new
          new RegExp(pattern, "i");
        } catch (_error) {
          throw new Error(`Invalid regex in ${label}: ${rule.title || rule.id}`);
        }
      }

      if (rule.domainRegex) {
        try {
          // eslint-disable-next-line no-new
          new RegExp(rule.domainRegex, "i");
        } catch (_error) {
          throw new Error(`Invalid domain regex in ${label}: ${rule.title || rule.id}`);
        }
      }
    }
  }

  function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function handleSidebarClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "toggle-domains") {
      uiState.domainsExpanded = !uiState.domainsExpanded;
      renderSidebar();
      return;
    }

    if (action === "toggle-domain") {
      const domainKey = button.dataset.domainKey;
      if (!domainKey) return;

      if (uiState.expandedDomains.has(domainKey)) {
        uiState.expandedDomains.delete(domainKey);
        renderSidebar();
      } else {
        uiState.expandedDomains.add(domainKey);
        uiState.domainsExpanded = true;
        navigateTo(sectionIdForDomain(domainKey));
      }
      return;
    }

    if (action === "select-domain") {
      const domainKey = button.dataset.domainKey;
      if (!domainKey) return;
      uiState.domainsExpanded = true;
      uiState.expandedDomains.add(domainKey);
      navigateTo(sectionIdForDomain(domainKey));
      return;
    }

    const target = button.dataset.navTarget;
    if (target) {
      navigateTo(target);
    }
  }

  function handleMainInput(event) {
    const target = event.target;

    if (target.dataset.kind === "setting") {
      const path = target.dataset.path;
      if (!path) return;

      let value;
      if (target.type === "checkbox") {
        value = target.checked;
      } else if (target.tagName === "TEXTAREA" && path === "ignoredDomains") {
        value = String(target.value || "")
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean);
      } else if (target.type === "number") {
        value = parseNumber(target.value, 0);
      } else {
        value = target.value;
      }

      setByPath(appState.settings, path, value);
      return;
    }

    if (target.dataset.kind === "domain-field") {
      const domainKey = target.dataset.domain;
      const field = target.dataset.field;
      const domain = getDomain(domainKey);
      if (!domain || !field) return;

      domain[field] = target.type === "checkbox" ? target.checked : target.value;
      domain.updatedAt = Date.now();

      if (field === "label") {
        render();
      }
      return;
    }

    if (target.dataset.kind === "rule-field") {
      const scope = target.dataset.scope;
      const domainKey = target.dataset.domain;
      const ruleId = target.dataset.ruleId;
      const field = target.dataset.field;
      const list = getRuleList(scope, domainKey);
      const rule = list.find((item) => item.id === ruleId);
      if (!rule) return;

      setRuleField(rule, field, target.type === "checkbox" ? target.checked : target.value, target.type === "checkbox");

      if (field === "generator.type" || field === "overrideEnabled") {
        renderMainContent();
      }
      return;
    }

    if (target.dataset.kind === "fixed-key" || target.dataset.kind === "fixed-value") {
      const domainKey = target.dataset.domain;
      const rowId = target.dataset.rowId;
      const rows = ensureFixedRows(domainKey);
      const row = rows.find((item) => item.id === rowId);
      if (!row) return;

      if (target.dataset.kind === "fixed-key") {
        row.key = target.value;
      } else {
        row.value = target.value;
      }

      const domain = getDomain(domainKey);
      if (domain) {
        domain.updatedAt = Date.now();
      }
    }
  }

  function handleMainClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "add-global-rule") {
      appState.globalRules.push(createRuleTemplate());
      render();
      return;
    }

    if (action === "add-domain-rule") {
      const domainKey = button.dataset.domain;
      const domain = getDomain(domainKey);
      if (!domain) return;
      domain.rules = Array.isArray(domain.rules) ? domain.rules : [];
      domain.rules.push(createRuleTemplate());
      domain.updatedAt = Date.now();
      render();
      return;
    }

    if (["rule-up", "rule-down", "rule-delete"].includes(action)) {
      const scope = button.dataset.scope;
      const domainKey = button.dataset.domain;
      const ruleId = button.dataset.ruleId;
      const list = getRuleList(scope, domainKey);

      if (action === "rule-delete") {
        const index = list.findIndex((rule) => rule.id === ruleId);
        if (index >= 0) list.splice(index, 1);
      } else {
        moveRule(list, ruleId, action === "rule-up" ? "up" : "down");
      }

      render();
      return;
    }

    if (action === "add-fixed-row") {
      const domainKey = button.dataset.domain;
      const rows = ensureFixedRows(domainKey);
      rows.push({ id: `${Date.now()}-${Math.random()}`, key: "", value: "" });
      const domain = getDomain(domainKey);
      if (domain) domain.updatedAt = Date.now();
      renderMainContent();
      return;
    }

    if (action === "remove-fixed-row") {
      const domainKey = button.dataset.domain;
      const rowId = button.dataset.rowId;
      const rows = ensureFixedRows(domainKey);
      const index = rows.findIndex((row) => row.id === rowId);
      if (index >= 0) {
        rows.splice(index, 1);
      }
      if (rows.length === 0) {
        rows.push({ id: `${Date.now()}-${Math.random()}`, key: "", value: "" });
      }
      const domain = getDomain(domainKey);
      if (domain) domain.updatedAt = Date.now();
      renderMainContent();
      return;
    }

    if (action === "remove-domain") {
      const domainKey = button.dataset.domain;
      if (!domainKey) return;

      const domain = getDomain(domainKey);
      const label = domain?.label || domainKey;
      const confirmed = globalThis.confirm(`Remove domain profile '${label}'?`);
      if (!confirmed) return;

      delete appState.domains[domainKey];
      delete uiState.fixedRows[domainKey];
      uiState.expandedDomains.delete(domainKey);

      if (uiState.activeTarget === sectionIdForDomain(domainKey)) {
        uiState.activeTarget = "section-general";
      }

      render();
      showStatus("Domain removed. Save settings to persist.");
      return;
    }
  }

  async function notifyBackgroundSettingsChanged() {
    try {
      await api.runtime.sendMessage({ type: "CHAOS_FILL_SETTINGS_UPDATED" });
    } catch (_error) {
      // Ignore if background is unavailable.
    }
  }

  async function saveState() {
    syncFixedRowsToState();

    validateRegexRules(appState.globalRules, "global rules");
    for (const domain of Object.values(appState.domains || {})) {
      validateRegexRules(domain.rules || [], `domain '${domain.label}'`);
    }

    appState.settings.password.randomLength = Math.max(4, Math.min(128, parseNumber(appState.settings.password.randomLength, 16)));
    appState.settings.fallback.maxLength = Math.max(1, Math.min(1024, parseNumber(appState.settings.fallback.maxLength, 20)));
    appState.settings.fallback.loremMaxWords = Math.max(1, Math.min(100, parseNumber(appState.settings.fallback.loremMaxWords, 6)));

    appState = await globalThis.ChaosFillStorage.saveState(appState);
    initFixedRowsFromState();
    await notifyBackgroundSettingsChanged();
    render();
    showStatus("Settings saved");
  }

  async function resetState() {
    appState = await globalThis.ChaosFillStorage.resetState();
    initFixedRowsFromState();
    uiState.domainsExpanded = false;
    uiState.expandedDomains = new Set();
    uiState.activeTarget = "section-general";
    await notifyBackgroundSettingsChanged();
    render();
    showStatus("Defaults restored");
  }

  async function exportState() {
    const json = await globalThis.ChaosFillStorage.exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "chaos-fill-settings.json";
    link.click();

    URL.revokeObjectURL(url);
    showStatus("Settings exported");
  }

  async function importStateFromFile(file) {
    const text = await file.text();
    appState = await globalThis.ChaosFillStorage.importState(text);
    initFixedRowsFromState();
    uiState.domainsExpanded = false;
    uiState.expandedDomains = new Set();
    uiState.activeTarget = "section-general";
    await notifyBackgroundSettingsChanged();
    render();
    showStatus("Settings imported");
  }

  async function getCurrentTabDomainKey() {
    if (!api.tabs?.query) return "";

    const tabs = await new Promise((resolve) => {
      try {
        api.tabs.query({ active: true, currentWindow: true }, (result) => {
          resolve(Array.isArray(result) ? result : []);
        });
      } catch (_error) {
        resolve([]);
      }
    });

    const activeTab = tabs[0];
    if (!activeTab?.url) return "";

    try {
      const hostname = new URL(activeTab.url).hostname;
      return globalThis.ChaosFillStorage.normalizeDomain(hostname);
    } catch (_error) {
      return "";
    }
  }

  async function init() {
    hideStatus();
    appState = await globalThis.ChaosFillStorage.getState();
    initFixedRowsFromState();

    const activeDomain = await getCurrentTabDomainKey();
    if (activeDomain && appState.domains?.[activeDomain]) {
      uiState.domainsExpanded = true;
      uiState.expandedDomains.add(activeDomain);
    }

    $("sidebar").addEventListener("click", handleSidebarClick);
    $("mainContent").addEventListener("input", handleMainInput);
    $("mainContent").addEventListener("change", handleMainInput);
    $("mainContent").addEventListener("click", handleMainClick);

    $("saveBtn").addEventListener("click", async () => {
      try {
        await saveState();
      } catch (error) {
        showStatus(String(error.message || error), true);
      }
    });

    $("resetBtn").addEventListener("click", async () => {
      try {
        await resetState();
      } catch (error) {
        showStatus(String(error.message || error), true);
      }
    });

    $("exportBtn").addEventListener("click", async () => {
      try {
        await exportState();
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
        await importStateFromFile(file);
      } catch (error) {
        showStatus(String(error.message || error), true);
      } finally {
        event.target.value = "";
      }
    });

    $("toastClose").addEventListener("click", () => {
      hideStatus();
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => showStatus(String(error.message || error), true));
  });
})();
