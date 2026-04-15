const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeInputElement {
  constructor(metadata = {}) {
    this.metadata = {
      id: "",
      name: "",
      type: "text",
      placeholder: "",
      labelText: "",
      ariaLabel: "",
      ariaLabelledbyText: "",
      className: "",
      nearbyText: "",
      ...metadata
    };
    this.tagName = "INPUT";
    this.type = this.metadata.type || "text";
    this.name = this.metadata.name || "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
  }

  dispatchEvent() {}

  click() {
    this.checked = !this.checked;
  }
}

function loadScript(relativePath) {
  const absolutePath = path.join(__dirname, "..", relativePath);
  const script = fs.readFileSync(absolutePath, "utf8");
  vm.runInThisContext(script, { filename: absolutePath });
}

function installRuntimeStubs() {
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTextAreaElement = class FakeTextAreaElement {};
  globalThis.HTMLSelectElement = class FakeSelectElement {};
  globalThis.location = { hostname: "example.com", href: "https://example.com/form" };

  globalThis.ChaosFillDom = {
    getFieldMetadata(element) {
      return element.metadata;
    },
    getFieldKind(element) {
      return element.type === "checkbox" ? "checkbox" : "text";
    },
    isFillableElement() {
      return true;
    },
    getRadioGroup(element) {
      return [element];
    },
    getFillableFields(form) {
      return Array.isArray(form?.fields) ? form.fields : [];
    },
    getBestForm() {
      return null;
    },
    getDocumentFillableFields() {
      return [];
    }
  };

  globalThis.ChaosFillGenerators = {
    generateForField(_element, resolved) {
      if (resolved?.generator?.type === "email") {
        return "generated@example.com";
      }
      return "generated-value";
    }
  };
}

installRuntimeStubs();
loadScript("WebExtension/rules.js");
loadScript("WebExtension/fill.js");

function createRule(overrides = {}) {
  return {
    id: "rule-1",
    title: "Email rule",
    enabled: true,
    generator: {
      type: "email",
      items: []
    },
    match: {
      kind: "contains",
      pattern: "email",
      target: "name"
    },
    outputMask: "",
    domainRegex: "",
    resolvedKey: "email",
    overrideEnabled: false,
    overrideValue: "",
    ...overrides
  };
}

function createConfig(rule) {
  return {
    settings: {
      triggerEvents: false,
      ignoreExistingContent: false,
      useAttributes: {
        id: true,
        name: true,
        label: true,
        ariaLabel: true,
        ariaLabelledby: true,
        placeholder: true,
        class: false,
        type: true
      }
    },
    globalRules: [rule],
    domainRules: [],
    domain: {
      id: "example.com",
      enabled: true,
      ignoreTokens: []
    },
    fixedValues: {},
    dataMode: "random"
  };
}

test("matching disabled rule suppresses fill instead of falling back to inference", () => {
  const field = new FakeInputElement({
    name: "email",
    labelText: "Email Address",
    placeholder: "you@example.com"
  });

  const config = createConfig(createRule({ enabled: false }));
  const result = globalThis.ChaosFillFill.fillField(field, config, { sessionValues: {} });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "disabled-rule");
  assert.equal(field.value, "");
});

test("higher-priority disabled domain rule blocks lower-priority enabled global rule", () => {
  const field = new FakeInputElement({
    name: "email",
    labelText: "Email Address"
  });

  const config = {
    settings: createConfig(createRule()).settings,
    globalRules: [
      createRule({
        id: "global-email-rule",
        title: "Global Email",
        enabled: true,
        overrideEnabled: true,
        overrideValue: "global@example.com"
      })
    ],
    domainRules: [
      createRule({
        id: "domain-email-rule",
        title: "Domain Email",
        enabled: false,
        overrideEnabled: true,
        overrideValue: "domain@example.com"
      })
    ],
    domain: {
      id: "example.com",
      enabled: true,
      ignoreTokens: []
    },
    fixedValues: {},
    dataMode: "random"
  };

  const result = globalThis.ChaosFillFill.fillField(field, config, { sessionValues: {} });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "disabled-rule");
  assert.equal(field.value, "");
});

test("matching enabled rule still fills normally", () => {
  const field = new FakeInputElement({
    name: "email",
    labelText: "Email Address"
  });

  const config = createConfig(createRule({
    overrideEnabled: true,
    overrideValue: "enabled@example.com"
  }));

  const result = globalThis.ChaosFillFill.fillField(field, config, { sessionValues: {} });

  assert.equal(result.status, "filled");
  assert.equal(field.value, "enabled@example.com");
});
