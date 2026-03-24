(() => {
  const FIRST_NAMES = [
    "Alex", "Sam", "Taylor", "Jordan", "Morgan", "Casey", "Jamie", "Chris", "Robin", "Drew"
  ];
  const LAST_NAMES = [
    "Miller", "Smith", "Brown", "Wilson", "Taylor", "Anderson", "Clark", "Davis", "Moore", "Walker"
  ];
  const COMPANIES = [
    "Northwind Labs", "Blue Harbor GmbH", "Pioneer Systems", "Brightline Tech", "Summit Works"
  ];
  const STREETS = [
    "Main Street 12", "Maple Avenue 8", "Riverside Drive 45", "Oak Lane 19", "Birch Road 33"
  ];
  const CITIES = [
    "Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt"
  ];
  const COUNTRIES = [
    "Germany", "Poland", "United Kingdom", "Netherlands", "France"
  ];
  const LOREM_WORDS = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "vestibulum",
    "nunc", "facilisis", "erat", "viverra", "massa", "placerat", "aliquet", "integer", "tellus",
    "suscipit", "commodo", "ornare", "fermentum", "cursus", "varius", "ultricies"
  ];

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomChoice(values) {
    if (!Array.isArray(values) || values.length === 0) return "";
    return values[randomInt(0, values.length - 1)];
  }

  function randomDigits(length) {
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += String(randomInt(0, 9));
    }
    return out;
  }

  function randomUpper(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += chars[randomInt(0, chars.length - 1)];
    }
    return out;
  }

  function randomAlphaNumeric(length) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += chars[randomInt(0, chars.length - 1)];
    }
    return out;
  }

  function randomLowerChar() {
    return String.fromCharCode(randomInt(97, 122));
  }

  function randomUpperChar() {
    return String.fromCharCode(randomInt(65, 90));
  }

  function randomDigitChar() {
    return String(randomInt(0, 9));
  }

  function randomAlphaNumChar() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return chars[randomInt(0, chars.length - 1)];
  }

  function getEmailDomain(settings) {
    const raw = String(settings?.fallback?.emailDomain || "example.com")
      .trim()
      .toLowerCase()
      .replace(/^@+/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw) ? raw : "example.com";
  }

  function applyOutputMask(value, outputMask) {
    const mask = String(outputMask || "");
    if (!mask.trim()) {
      return String(value ?? "");
    }

    const source = String(value ?? "");
    const digits = Array.from(source.match(/\d/g) || []);
    const upper = Array.from(source.match(/[A-Z]/g) || []);
    const lower = Array.from(source.match(/[a-z]/g) || []);
    const alnum = Array.from(source.match(/[A-Za-z0-9]/g) || []);
    const any = Array.from(source);

    const takeFromPool = (pool, fallback) => {
      if (pool.length > 0) {
        return pool.shift();
      }
      return fallback();
    };

    let out = "";
    for (let index = 0; index < mask.length; index += 1) {
      const token = mask[index];

      if (token === "\\") {
        const next = mask[index + 1];
        if (next !== undefined) {
          out += next;
          index += 1;
        }
        continue;
      }

      if (token === "#") {
        out += takeFromPool(digits, randomDigitChar);
      } else if (token === "A") {
        out += takeFromPool(upper, randomUpperChar);
      } else if (token === "a") {
        out += takeFromPool(lower, randomLowerChar);
      } else if (token === "X") {
        out += takeFromPool(alnum, randomAlphaNumChar);
      } else if (token === "?") {
        out += takeFromPool(any, randomAlphaNumChar);
      } else {
        out += token;
      }
    }

    return out;
  }

  function clampLength(value, element, settings, options = {}) {
    const applyFallbackLimit = options.applyFallbackLimit !== false;
    const fallbackMax = Number(settings?.fallback?.maxLength || 20);
    const elementMax = Number(element?.maxLength || -1);
    let max = -1;

    if (elementMax > 0 && applyFallbackLimit) {
      max = Math.min(fallbackMax, elementMax);
    } else if (elementMax > 0) {
      max = elementMax;
    } else if (applyFallbackLimit) {
      max = fallbackMax;
    }

    if (!Number.isFinite(max) || max <= 0) return String(value);
    return String(value).slice(0, max);
  }

  function randomDate(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const from = Number.isFinite(startDate.getTime()) ? startDate.getTime() : new Date("1970-01-01").getTime();
    const to = Number.isFinite(endDate.getTime()) ? endDate.getTime() : new Date("2030-12-31").getTime();
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    const timestamp = randomInt(min, max);
    return new Date(timestamp);
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatDatetimeLocal(date) {
    return `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function loremWordCount(maxWords) {
    const safeMax = Math.max(1, Number(maxWords || 6));
    return randomInt(1, safeMax);
  }

  function loremPhrase(maxWords) {
    const words = [];
    const count = loremWordCount(maxWords);
    for (let index = 0; index < count; index += 1) {
      words.push(randomChoice(LOREM_WORDS));
    }
    return words.join(" ");
  }

  function loremSentence(maxWords) {
    const phrase = loremPhrase(maxWords);
    return phrase.charAt(0).toUpperCase() + phrase.slice(1) + ".";
  }

  function parseBooleanLike(value, fallback) {
    if (typeof value === "boolean") return value;
    const normalized = String(value || "").trim().toLowerCase();
    if (["1", "true", "yes", "checked", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "unchecked", "off"].includes(normalized)) return false;
    return fallback;
  }

  function generateByType(type, settings, generator, element) {
    switch (type) {
      case "firstName":
        return randomChoice(FIRST_NAMES);
      case "lastName":
        return randomChoice(LAST_NAMES);
      case "fullName":
        return `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;
      case "email": {
        const first = randomChoice(FIRST_NAMES).toLowerCase();
        const last = randomChoice(LAST_NAMES).toLowerCase();
        const domain = getEmailDomain(settings);
        return `${first}.${last}${randomInt(10, 999)}@${domain}`;
      }
      case "number": {
        const minAttr = Number(element?.min);
        const maxAttr = Number(element?.max);
        const hasMin = Number.isFinite(minAttr);
        const hasMax = Number.isFinite(maxAttr);

        let min = hasMin ? minAttr : 0;
        let max = hasMax ? maxAttr : (min + 9999);
        if (max < min) {
          const tmp = min;
          min = max;
          max = tmp;
        }

        const stepRaw = String(element?.step || "").trim();
        if (stepRaw && stepRaw !== "any") {
          const step = Number(stepRaw);
          if (Number.isFinite(step) && step > 0) {
            const maxSteps = Math.floor((max - min) / step);
            const stepCount = Math.max(0, maxSteps);
            const picked = min + (randomInt(0, stepCount) * step);
            return String(Number(picked.toFixed(6))).replace(/\.?0+$/, "");
          }
        }

        const intMin = Math.ceil(min);
        const intMax = Math.floor(max);
        if (intMax >= intMin) {
          return String(randomInt(intMin, intMax));
        }

        const fallback = min + Math.random() * (max - min || 1);
        return String(Number(fallback.toFixed(6))).replace(/\.?0+$/, "");
      }
      case "phone": {
        const format = String(settings?.fallback?.phoneFormat || "+49###########");
        return format.replace(/#/g, () => String(randomInt(0, 9)));
      }
      case "company":
        return randomChoice(COMPANIES);
      case "street":
        return randomChoice(STREETS);
      case "city":
        return randomChoice(CITIES);
      case "zip":
        return randomDigits(5);
      case "country":
        return randomChoice(COUNTRIES);
      case "iban":
        return `DE${randomDigits(20)}`;
      case "bic":
        return `${randomUpper(4)}DE${randomUpper(2)}${randomUpper(2)}${Math.random() > 0.5 ? randomUpper(3) : ""}`;
      case "vatId":
        return `${randomUpper(2)}${randomDigits(9)}`;
      case "password": {
        const mode = settings?.password?.mode === "random" ? "random" : "fixed";
        if (mode === "fixed") {
          return String(settings?.password?.fixedValue || "P@$$w0rd!");
        }
        const length = Number(settings?.password?.randomLength || 16);
        return randomAlphaNumeric(Math.max(4, Math.min(128, length)));
      }
      case "date": {
        const value = randomDate(settings?.fallback?.dateStart, settings?.fallback?.dateEnd);
        return formatDate(value);
      }
      case "datetime-local": {
        const value = randomDate(settings?.fallback?.dateStart, settings?.fallback?.dateEnd);
        return formatDatetimeLocal(value);
      }
      case "randomized-list": {
        const items = Array.isArray(generator?.items)
          ? generator.items.map((item) => String(item).trim()).filter(Boolean)
          : [];
        return items.length > 0 ? randomChoice(items) : "";
      }
      case "lorem":
      default:
        return loremPhrase(settings?.fallback?.loremMaxWords || 6);
    }
  }

  function generateCheckboxValue(settings, bundle) {
    if (globalThis.ChaosFillRules.isAgreeField(bundle, settings)) {
      return true;
    }

    const policy = settings?.fallback?.checkboxDefault || "random";
    if (policy === "checked") return true;
    if (policy === "unchecked") return false;
    return Math.random() >= 0.5;
  }

  function generateRadioChoice(settings) {
    return { strategy: settings?.fallback?.radioStrategy || "random" };
  }

  function generateSelectDefault() {
    return "";
  }

  function generateTextualFallback(element, settings) {
    if (element instanceof HTMLInputElement && element.type === "number") {
      return String(randomInt(1, 99999));
    }

    if (element instanceof HTMLTextAreaElement) {
      return loremSentence(Math.max(8, settings?.fallback?.loremMaxWords || 10));
    }

    return loremPhrase(settings?.fallback?.loremMaxWords || 6);
  }

  function generateForField(element, resolved, settings, context, bundle) {
    const kind = globalThis.ChaosFillDom.getFieldKind(element);
    const generator = resolved?.generator || { type: "lorem" };

    if ((kind === "text" || kind === "textarea") && globalThis.ChaosFillRules.isConfirmationField(bundle, settings)) {
      if (context?.lastTextValue) {
        return context.lastTextValue;
      }
    }

    if (kind === "checkbox") {
      if (generator.type !== "checkbox-default") {
        const candidate = generateByType(generator.type, settings, generator, element);
        return parseBooleanLike(candidate, generateCheckboxValue(settings, bundle));
      }
      return generateCheckboxValue(settings, bundle);
    }

    if (kind === "radio") {
      if (generator.type !== "radio-default") {
        return generateByType(generator.type, settings, generator, element);
      }
      return generateRadioChoice(settings);
    }

    if (kind === "select") {
      if (generator.type !== "select-default") {
        return generateByType(generator.type, settings, generator, element);
      }
      return generateSelectDefault();
    }

    let value;
    if (kind === "date") {
      value = generateByType("date", settings, generator, element);
    } else if (kind === "datetime-local") {
      value = generateByType("datetime-local", settings, generator, element);
    } else if (generator.type === "lorem" && kind !== "text" && kind !== "textarea") {
      value = generateTextualFallback(element, settings);
    } else {
      value = generateByType(generator.type, settings, generator, element);
    }

    if (!value) {
      value = generateTextualFallback(element, settings);
    }

    if (kind === "text" || kind === "textarea" || kind === "date" || kind === "datetime-local") {
      value = applyOutputMask(value, resolved?.outputMask);
    }

    // Fallback max length is for generic lorem-style fallback text.
    // Structured generators (IBAN, VAT, email, etc.) and masked outputs
    // should keep their full format unless the field itself enforces maxLength.
    const hasOutputMask = String(resolved?.outputMask || "").trim().length > 0;
    const shouldUseFallbackMax = !hasOutputMask && generator.type === "lorem";
    return clampLength(value, element, settings, { applyFallbackLimit: shouldUseFallbackMax });
  }

  globalThis.ChaosFillGenerators = {
    generateForField,
    generateByType,
    clampLength,
    randomInt,
    randomChoice
  };
})();
