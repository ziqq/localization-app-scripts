import js from "@eslint/js";
import globals from "globals";

const appsScriptGlobals = {
  LanguageApp: "readonly",
  Logger: "readonly",
  PropertiesService: "readonly",
  ScriptApp: "readonly",
  SpreadsheetApp: "readonly",
  UrlFetchApp: "readonly",
  Utilities: "readonly",
  API_DEFAULTS: "readonly",
  assertTargetSpreadsheet: "readonly",
  TARGET_SPREADSHEET: "readonly",
  TRANSLATION_CONFIG: "readonly",
  HIGHLIGHT_CONTEXT_PROPERTY: "readonly",
  LOCALIZATION_CONFIG: "readonly",
  getLocalizationColumns: "readonly",
  getSheetHeaders: "readonly",
  indexLocalizationHeader: "readonly",
  readActiveLocalizationSheet: "readonly",
  safeString: "readonly",
  setRowNote: "readonly",
  showToast: "readonly",
};

export default [
  {
    ignores: ["node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      globals: {
        ...globals.es2021,
        ...appsScriptGlobals,
      },
    },
    rules: {
      // Apps Script resolves entrypoints and cross-file declarations globally.
      "no-redeclare": "off",
      "no-unused-vars": "off",
    },
  },
  {
    files: ["n8n/**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script",
      parserOptions: {
        ecmaFeatures: {
          globalReturn: true,
        },
      },
      globals: {
        $: "readonly",
        $input: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["test/**/*.js", "test-support/**/*.js", "tool/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
];
