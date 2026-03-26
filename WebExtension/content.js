(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const CONTENT_LOG_PREFIX = "CHAOSFILL_CONTENT:";
  const debugLog = (...args) => console.log(CONTENT_LOG_PREFIX, ...args);
  const debugError = (...args) => console.error(CONTENT_LOG_PREFIX, ...args);

  debugLog("content.js loaded", globalThis.location.href);
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

  async function canRun(settingsLike) {
    const decision = globalThis.ChaosFillRules.isDomainBlocked(globalThis.location.href, settingsLike);
    return !decision.blocked ? { ok: true } : { ok: false, ...decision };
  }

  async function runCommand(message) {
    debugLog("content runCommand", { type: message?.type, href: globalThis.location.href });
    if (message.type === "CHAOS_FILL_CAPTURE_CONTEXT_FIELD") {
      return getContextFieldConfigurationData();
    }

    if (message.type === "CHAOS_FILL_CAPTURE_PAGE_FIELDS") {
      const state = await globalThis.ChaosFillStorage.getState();
      return getPageFieldConfigurationData(state.settings);
    }

    const effectiveConfig = message.config || (await globalThis.ChaosFillStorage.getEffectiveDomainConfig(globalThis.location.hostname));
    if (effectiveConfig?.domain && effectiveConfig.domain.enabled === false) {
      debugLog("content runCommand blocked: domain disabled", { domain: effectiveConfig?.domain?.id });
      return {
        ok: false,
        blocked: true,
        reason: "domain-disabled"
      };
    }
    const allowed = await canRun(effectiveConfig.settings);
    if (!allowed.ok) {
      debugLog("content runCommand blocked by policy", allowed);
      return {
        ok: false,
        blocked: true,
        reason: allowed.reason,
        pattern: allowed.pattern || null
      };
    }

    const context = {
      lastTextValue: "",
      sessionValues: message.sessionValues && typeof message.sessionValues === "object"
        ? { ...message.sessionValues }
        : {}
    };

    if (message.type === "CHAOS_FILL_FILL_BEST_FORM") {
      const summary = globalThis.ChaosFillFill.fillBestForm(effectiveConfig, context);
      debugLog("content fill best form summary", summary);
      return { ok: true, action: message.type, ...summary, sessionValues: context.sessionValues };
    }

    if (message.type === "CHAOS_FILL_FILL_CONTEXT_FIELD") {
      const target = getContextElement();
      if (!target) {
        return { ok: false, reason: "no-target-field" };
      }

      const result = globalThis.ChaosFillFill.fillField(target, effectiveConfig, context);
      debugLog("content fill context field result", result);
      return { ok: true, action: message.type, result, sessionValues: context.sessionValues };
    }

    if (message.type === "CHAOS_FILL_FILL_CONTEXT_FORM") {
      const target = getContextElement();
      const form = target ? globalThis.ChaosFillDom.getOwningForm(target) : null;

      if (!form) {
        const summary = globalThis.ChaosFillFill.fillBestForm(effectiveConfig, context);
        return { ok: true, action: message.type, fallback: true, ...summary, sessionValues: context.sessionValues };
      }

      const summary = globalThis.ChaosFillFill.fillForm(form, effectiveConfig, context);
      debugLog("content fill context form summary", summary);
      return { ok: true, action: message.type, foundForm: true, ...summary, sessionValues: context.sessionValues };
    }

    return { ok: false, reason: "unknown-command" };
  }

  globalThis.document.addEventListener("contextmenu", rememberContextElement, true);
  debugLog("runtime.onMessage listener registered");

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string" || !message.type.startsWith("CHAOS_FILL_")) {
      return false;
    }

    runCommand(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        debugError("content runCommand error", error);
        sendResponse({ ok: false, reason: String(error) });
      });

    return true;
  });
})();
