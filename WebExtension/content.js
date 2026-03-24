(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  let lastContextElement = null;

  function rememberContextElement(event) {
    const target = globalThis.ChaosFillDom.getClosestFillable(event.target);
    if (!target) {
      lastContextElement = null;
      return;
    }
    lastContextElement = target;
  }

  function getContextElement() {
    if (lastContextElement && lastContextElement.isConnected) {
      return lastContextElement;
    }

    const active = globalThis.ChaosFillDom.getClosestFillable(globalThis.document.activeElement);
    if (active) return active;

    return null;
  }

  function getContextFieldConfigurationData() {
    const target = getContextElement();
    if (!target) {
      return { ok: false, reason: "no-target-field" };
    }

    const metadata = globalThis.ChaosFillDom.getFieldMetadata(target);
    return {
      ok: true,
      action: "CHAOS_FILL_CAPTURE_CONTEXT_FIELD",
      field: {
        ...metadata,
        tagName: target.tagName.toLowerCase()
      },
      page: {
        href: globalThis.location.href,
        hostname: globalThis.location.hostname
      }
    };
  }

  function getPageFieldConfigurationData(settings) {
    const candidates = Array.from(globalThis.document.querySelectorAll("input, textarea, select"));
    const fields = candidates
      .filter((element) => globalThis.ChaosFillDom.isFillableElement(element, settings))
      .map((element) => {
        const metadata = globalThis.ChaosFillDom.getFieldMetadata(element);
        return {
          ...metadata,
          tagName: element.tagName.toLowerCase()
        };
      });

    return {
      ok: true,
      action: "CHAOS_FILL_CAPTURE_PAGE_FIELDS",
      count: fields.length,
      fields,
      page: {
        href: globalThis.location.href,
        hostname: globalThis.location.hostname
      }
    };
  }

  async function canRun(settings) {
    const decision = globalThis.ChaosFillRules.isDomainBlocked(globalThis.location.href, settings);
    return !decision.blocked ? { ok: true } : { ok: false, ...decision };
  }

  async function runCommand(message) {
    if (message.type === "CHAOS_FILL_CAPTURE_CONTEXT_FIELD") {
      return getContextFieldConfigurationData();
    }

    if (message.type === "CHAOS_FILL_CAPTURE_PAGE_FIELDS") {
      const settings = await globalThis.ChaosFillStorage.getSettings();
      return getPageFieldConfigurationData(settings);
    }

    const settings = await globalThis.ChaosFillStorage.getSettings();
    const allowed = await canRun(settings);
    if (!allowed.ok) {
      return {
        ok: false,
        blocked: true,
        reason: allowed.reason,
        pattern: allowed.pattern || null
      };
    }

    const context = { lastTextValue: "" };

    if (message.type === "CHAOS_FILL_FILL_BEST_FORM") {
      const summary = globalThis.ChaosFillFill.fillBestForm(settings, context);
      return { ok: true, action: message.type, ...summary };
    }

    if (message.type === "CHAOS_FILL_FILL_CONTEXT_FIELD") {
      const target = getContextElement();
      if (!target) {
        return { ok: false, reason: "no-target-field" };
      }

      const result = globalThis.ChaosFillFill.fillField(target, settings, context);
      return { ok: true, action: message.type, result };
    }

    if (message.type === "CHAOS_FILL_FILL_CONTEXT_FORM") {
      const target = getContextElement();
      const form = target ? globalThis.ChaosFillDom.getOwningForm(target) : null;

      if (!form) {
        const summary = globalThis.ChaosFillFill.fillBestForm(settings, context);
        return { ok: true, action: message.type, fallback: true, ...summary };
      }

      const summary = globalThis.ChaosFillFill.fillForm(form, settings, context);
      return { ok: true, action: message.type, foundForm: true, ...summary };
    }

    return { ok: false, reason: "unknown-command" };
  }

  globalThis.document.addEventListener("contextmenu", rememberContextElement, true);

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string" || !message.type.startsWith("CHAOS_FILL_")) {
      return false;
    }

    runCommand(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, reason: String(error) }));

    return true;
  });
})();
