(() => {
  const TEXT_INPUT_TYPES = new Set([
    "text",
    "email",
    "tel",
    "number",
    "password",
    "url",
    "search"
  ]);

  function toInputType(element) {
    return String(element.type || "text").toLowerCase();
  }

  function getFieldKind(element) {
    if (!element || !(element instanceof Element)) {
      return null;
    }

    if (element instanceof HTMLTextAreaElement) {
      return "textarea";
    }

    if (element instanceof HTMLSelectElement) {
      return "select";
    }

    if (element instanceof HTMLInputElement) {
      const type = toInputType(element);
      if (type === "hidden") return null;
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "date") return "date";
      if (type === "datetime-local") return "datetime-local";
      if (TEXT_INPUT_TYPES.has(type)) return "text";
    }

    return null;
  }

  function isIntrinsicIgnored(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
      return true;
    }

    if (element instanceof HTMLInputElement && toInputType(element) === "hidden") {
      return true;
    }

    if (element.disabled) {
      return true;
    }

    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.readOnly) {
      return true;
    }

    return false;
  }

  function isVisible(element) {
    const style = globalThis.getComputedStyle(element);

    if (element.offsetParent === null) {
      return false;
    }

    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  }

  function isFillableElement(element, settings) {
    if (!getFieldKind(element)) {
      return false;
    }

    if (isIntrinsicIgnored(element)) {
      return false;
    }

    const ignoreHiddenInvisible = settings?.ignoreHiddenInvisible ?? settings?.general?.ignoreHiddenInvisible;
    if (ignoreHiddenInvisible !== false && !isVisible(element)) {
      return false;
    }

    return true;
  }

  function safeCssEscape(value) {
    if (globalThis.CSS?.escape) {
      return globalThis.CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function uniqueTexts(parts) {
    const seen = new Set();
    const output = [];
    for (const part of parts) {
      const cleaned = cleanText(part);
      if (!cleaned) continue;
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      output.push(cleaned);
    }
    return output;
  }

  function getLabelTexts(element) {
    const labels = [];

    if (element.id) {
      const linked = globalThis.document.querySelectorAll(`label[for="${safeCssEscape(element.id)}"]`);
      linked.forEach((label) => labels.push(label.textContent || ""));
    }

    const wrapping = element.closest("label");
    if (wrapping) {
      labels.push(wrapping.textContent || "");
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      if (Array.isArray(element.labels) || element.labels?.length) {
        Array.from(element.labels || []).forEach((label) => labels.push(label.textContent || ""));
      }
    }

    return uniqueTexts(labels);
  }

  function getAriaLabelledbyText(element) {
    const ids = (element.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => id.trim())
      .filter(Boolean);

    const parts = [];
    for (const id of ids) {
      const node = globalThis.document.getElementById(id);
      if (node) {
        parts.push(node.textContent || "");
      }
    }

    return uniqueTexts(parts).join(" ");
  }

  function getNearbyText(element) {
    const parts = [];

    const pushText = (node) => {
      if (!node || !(node instanceof Element)) return;
      if (node.matches("input,textarea,select,button,script,style")) return;
      parts.push(node.textContent || "");
    };

    pushText(element.previousElementSibling);
    pushText(element.nextElementSibling);

    // Walk up a few ancestor levels and inspect immediate sibling blocks.
    // This helps row/column form layouts where label text sits in a neighbor column.
    let cursor = element.parentElement;
    let depth = 0;
    while (cursor && depth < 3) {
      pushText(cursor.previousElementSibling);
      pushText(cursor.nextElementSibling);
      cursor = cursor.parentElement;
      depth += 1;
    }

    return uniqueTexts(parts).join(" ").slice(0, 320);
  }

  function getFieldMetadata(element) {
    const labels = getLabelTexts(element);
    return {
      id: element.id || "",
      name: element.getAttribute("name") || "",
      type: element instanceof HTMLInputElement ? toInputType(element) : element.tagName.toLowerCase(),
      placeholder: (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
        ? element.getAttribute("placeholder") || ""
        : "",
      className: element.className || "",
      labelText: labels.join(" "),
      ariaLabel: element.getAttribute("aria-label") || "",
      ariaLabelledbyText: getAriaLabelledbyText(element),
      nearbyText: getNearbyText(element)
    };
  }

  function getOwningForm(element) {
    if (!element) return null;
    if (element.form) return element.form;
    return element.closest("form");
  }

  function getFillableFields(form, settings) {
    if (!form) return [];
    const all = Array.from(form.querySelectorAll("input, textarea, select"));
    return all.filter((element) => isFillableElement(element, settings));
  }

  function getDocumentFillableFields(settings) {
    const all = Array.from(globalThis.document.querySelectorAll("input, textarea, select"));
    return all.filter((element) => isFillableElement(element, settings));
  }

  function getClosestFillable(target, settings) {
    if (!(target instanceof Element)) {
      return null;
    }
    const closest = target.closest("input, textarea, select");
    if (!closest) return null;
    if (settings && !isFillableElement(closest, settings)) return null;
    if (!settings && !getFieldKind(closest)) return null;
    return closest;
  }

  function getBestForm(settings) {
    const active = globalThis.document.activeElement;
    const focused = getClosestFillable(active, settings);
    if (focused) {
      const form = getOwningForm(focused);
      if (form) {
        return form;
      }
    }

    let bestForm = null;
    let bestScore = -1;
    const forms = Array.from(globalThis.document.querySelectorAll("form"));

    for (const form of forms) {
      const score = getFillableFields(form, settings).length;
      if (score > bestScore) {
        bestScore = score;
        bestForm = form;
      }
    }

    return bestScore > 0 ? bestForm : null;
  }

  function getRadioGroup(radio, settings) {
    if (!(radio instanceof HTMLInputElement) || radio.type !== "radio") {
      return [];
    }

    const form = getOwningForm(radio);
    if (!form) {
      return [radio].filter((element) => isFillableElement(element, settings));
    }

    if (!radio.name) {
      return [radio].filter((element) => isFillableElement(element, settings));
    }

    const escapedName = safeCssEscape(radio.name);
    const candidates = Array.from(form.querySelectorAll(`input[type="radio"][name="${escapedName}"]`));
    return candidates.filter((element) => isFillableElement(element, settings));
  }

  globalThis.ChaosFillDom = {
    TEXT_INPUT_TYPES,
    getFieldKind,
    isVisible,
    isFillableElement,
    getFieldMetadata,
    getOwningForm,
    getFillableFields,
    getDocumentFillableFields,
    getClosestFillable,
    getBestForm,
    getRadioGroup
  };
})();
