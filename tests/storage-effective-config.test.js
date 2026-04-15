const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createStorageSandbox() {
  const localState = {};
  const browser = {
    storage: {
      local: {
        async get(key) {
          return { [key]: localState[key] };
        },
        async set(value) {
          Object.assign(localState, value);
        }
      }
    }
  };

  const sandbox = {
    console: {
      log() {},
      error() {}
    },
    JSON,
    Date,
    Math,
    URL,
    browser
  };

  sandbox.globalThis = sandbox;
  return { sandbox, localState };
}

function loadStorageModule(sandbox) {
  const absolutePath = path.join(__dirname, "..", "WebExtension", "storage.js");
  const script = fs.readFileSync(absolutePath, "utf8");
  vm.runInNewContext(script, sandbox, { filename: absolutePath });
  return sandbox.ChaosFillStorage;
}

test("saveState and getEffectiveDomainConfig preserve enabled=false for global and domain rules", async () => {
  const { sandbox, localState } = createStorageSandbox();
  const storage = loadStorageModule(sandbox);

  const state = {
    version: storage.CURRENT_SETTINGS_VERSION,
    settings: storage.DEFAULT_SETTINGS,
    globalRules: [
      {
        id: "global-disabled",
        title: "Disabled Global Rule",
        generator: { type: "email", items: [] },
        match: { kind: "contains", pattern: "email", target: "name" },
        outputMask: "",
        domainRegex: "",
        resolvedKey: "email",
        overrideEnabled: false,
        overrideValue: "",
        enabled: false
      }
    ],
    domains: {
      "example.com": {
        id: "example.com",
        label: "example.com",
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
        dataMode: "inherit",
        rules: [
          {
            id: "domain-disabled",
            title: "Disabled Domain Rule",
            generator: { type: "email", items: [] },
            match: { kind: "contains", pattern: "email", target: "name" },
            outputMask: "",
            domainRegex: "",
            resolvedKey: "email",
            overrideEnabled: false,
            overrideValue: "",
            enabled: false
          }
        ],
        fixedValues: {},
        ignoreTokens: [],
        notes: ""
      }
    }
  };

  await storage.saveState(state);

  assert.equal(localState[storage.STORAGE_KEY].globalRules[0].enabled, false);
  assert.equal(localState[storage.STORAGE_KEY].domains["example.com"].rules[0].enabled, false);

  const effective = await storage.getEffectiveDomainConfig("example.com");

  assert.equal(effective.globalRules[0].enabled, false);
  assert.equal(effective.domainRules[0].enabled, false);
});
