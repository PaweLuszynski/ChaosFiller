(() => {
  function dispatchEvents(element, settings) {
    if (settings?.general?.triggerEvents === false) {
      return;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeValue(element, value) {
    const stringValue = String(value ?? "");

    let prototype = null;
    if (element instanceof HTMLInputElement) prototype = HTMLInputElement.prototype;
    else if (element instanceof HTMLTextAreaElement) prototype = HTMLTextAreaElement.prototype;
    else if (element instanceof HTMLSelectElement) prototype = HTMLSelectElement.prototype;

    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, "value") : null;
    if (descriptor?.set) {
      descriptor.set.call(element, stringValue);
    } else {
      element.value = stringValue;
    }
  }

  function chooseSelectOption(element, value) {
    const options = Array.from(element.options || []);
    if (options.length === 0) return null;

    const valueString = String(value ?? "").trim();

    if (valueString) {
      const exactValue = options.find((option) => option.value === valueString);
      if (exactValue) return exactValue;

      const exactText = options.find((option) => option.textContent?.trim() === valueString);
      if (exactText) return exactText;

      const partialText = options.find((option) =>
        option.textContent?.toLowerCase().includes(valueString.toLowerCase())
      );
      if (partialText) return partialText;
    }

    const enabledOptions = options.filter((option) => !option.disabled);
    if (enabledOptions.length === 0) return options[0];

    return enabledOptions[Math.floor(Math.random() * enabledOptions.length)];
  }

  function setSelectValue(element, value, settings) {
    const targetOption = chooseSelectOption(element, value);
    if (!targetOption) return false;

    if (element.value === targetOption.value) {
      return false;
    }

    setNativeValue(element, targetOption.value);
    dispatchEvents(element, settings);
    return true;
  }

  function setCheckboxValue(element, desired, settings) {
    const target = Boolean(desired);
    if (element.checked === target) {
      return false;
    }

    element.click();

    if (element.checked !== target) {
      element.checked = target;
      dispatchEvents(element, settings);
    }

    return true;
  }

  function chooseRadioTarget(radios, generated, settings) {
    const enabled = radios.filter((radio) => !radio.disabled);
    if (enabled.length === 0) return null;

    if (typeof generated === "number" && generated >= 0 && generated < enabled.length) {
      return enabled[generated];
    }

    if (typeof generated === "string" && generated.trim()) {
      const valueString = generated.trim().toLowerCase();
      const byValue = enabled.find((radio) => (radio.value || "").toLowerCase() === valueString);
      if (byValue) return byValue;

      const byLabel = enabled.find((radio) => {
        const meta = globalThis.ChaosFillDom.getFieldMetadata(radio);
        const label = `${meta.labelText} ${meta.ariaLabel} ${meta.ariaLabelledbyText}`.toLowerCase();
        return label.includes(valueString);
      });
      if (byLabel) return byLabel;
    }

    const strategy = typeof generated === "object" && generated?.strategy
      ? generated.strategy
      : settings?.fallback?.radioStrategy;

    if (strategy === "firstEnabled") {
      return enabled[0];
    }

    return enabled[Math.floor(Math.random() * enabled.length)];
  }

  function setRadioGroup(radios, generated, settings) {
    const target = chooseRadioTarget(radios, generated, settings);
    if (!target) return false;
    if (target.checked) return false;

    target.click();

    if (!target.checked) {
      target.checked = true;
      dispatchEvents(target, settings);
    }

    return true;
  }

  function hasExistingContent(element) {
    const kind = globalThis.ChaosFillDom.getFieldKind(element);

    if (kind === "checkbox" || kind === "radio") {
      return element.checked;
    }

    if (kind === "select") {
      return String(element.value || "").trim() !== "";
    }

    return String(element.value || "").trim() !== "";
  }

  function shouldSkipForExistingContent(element, settings) {
    if (settings?.general?.ignoreExistingContent !== true) {
      return false;
    }

    return hasExistingContent(element);
  }

  function fillField(element, settings, context = {}) {
    try {
      if (!globalThis.ChaosFillDom.isFillableElement(element, settings)) {
        return { status: "skipped", reason: "not-fillable" };
      }

      if (!globalThis.ChaosFillRules.hasEnabledRules(settings?.rules)) {
        return { status: "skipped", reason: "no-rules-configured" };
      }

      if (shouldSkipForExistingContent(element, settings)) {
        return { status: "skipped", reason: "already-has-content" };
      }

      const bundle = globalThis.ChaosFillRules.buildMatchBundle(element, settings);

      if (globalThis.ChaosFillRules.shouldIgnoreByTokens(bundle.text, settings?.general?.ignoreMatchTokens)) {
        return { status: "skipped", reason: "ignored-token" };
      }

      const resolved = globalThis.ChaosFillRules.resolveGenerator(
        element,
        bundle,
        settings,
        globalThis.location.hostname
      );

      if (resolved?.source === "none") {
        return { status: "skipped", reason: "no-rule-match" };
      }

      const kind = globalThis.ChaosFillDom.getFieldKind(element);
      const generated = globalThis.ChaosFillGenerators.generateForField(
        element,
        resolved,
        settings,
        context,
        bundle
      );

      let changed = false;

      if (kind === "checkbox") {
        changed = setCheckboxValue(element, generated, settings);
      } else if (kind === "radio") {
        const radios = globalThis.ChaosFillDom.getRadioGroup(element, settings);
        changed = setRadioGroup(radios, generated, settings);
      } else if (kind === "select") {
        changed = setSelectValue(element, generated, settings);
      } else {
        const oldValue = String(element.value || "");
        setNativeValue(element, generated ?? "");
        changed = oldValue !== String(element.value || "");
        dispatchEvents(element, settings);

        if (changed && (kind === "text" || kind === "textarea")) {
          context.lastTextValue = String(element.value || "");
        }
      }

      if (changed) {
        return { status: "filled", source: resolved.source, value: generated };
      }

      return { status: "skipped", reason: "no-change" };
    } catch (error) {
      return { status: "error", reason: String(error) };
    }
  }

  function fillForm(form, settings, context = {}) {
    const fields = globalThis.ChaosFillDom.getFillableFields(form, settings);
    const summary = {
      filled: 0,
      skipped: 0,
      errors: 0,
      total: fields.length
    };

    const processedRadioNames = new Set();

    for (const field of fields) {
      const kind = globalThis.ChaosFillDom.getFieldKind(field);

      if (kind === "radio") {
        const radioName = field.name || `__unnamed__${fields.indexOf(field)}`;
        if (processedRadioNames.has(radioName)) {
          continue;
        }
        processedRadioNames.add(radioName);
      }

      const result = fillField(field, settings, context);

      if (result.status === "filled") summary.filled += 1;
      else if (result.status === "error") summary.errors += 1;
      else summary.skipped += 1;
    }

    return summary;
  }

  function fillBestForm(settings, context = {}) {
    const form = globalThis.ChaosFillDom.getBestForm(settings);
    if (!form) {
      return {
        foundForm: false,
        filled: 0,
        skipped: 0,
        errors: 0,
        total: 0
      };
    }

    const summary = fillForm(form, settings, context);
    return {
      foundForm: true,
      ...summary
    };
  }

  globalThis.ChaosFillFill = {
    fillField,
    fillForm,
    fillBestForm,
    setNativeValue
  };
})();
