import assert from "node:assert/strict";
import test from "node:test";

import {
  createTargetSpreadsheet,
  loadAppsScript,
} from "../test-support/load-apps-script.js";

const script = loadAppsScript(["config.js", "sheets.js"]);

const localizationHeaders = ["label", "description", "meta", "ru", "en"];

function createSheet(name, headers = localizationHeaders) {
  return {
    getName: () => name,
    getLastColumn: () => headers.length,
    getRange: () => ({ getDisplayValues: () => [headers] }),
  };
}

test("target discovery includes only non-metadata sheets with localization schema", () => {
  const sheets = [
    createSheet("app"),
    createSheet("products"),
    createSheet("future_domain"),
    createSheet("template"),
    createSheet("locales"),
    createSheet("unrelated", []),
  ];
  const spreadsheet = createTargetSpreadsheet({
    getSheets: () => sheets,
  });

  const names = Array.from(script.getTargetSheets(spreadsheet), (sheet) =>
    sheet.getName(),
  );

  assert.deepEqual(names, ["app", "products", "future_domain"]);
});

test("new localization sheet names are validated before template is copied", () => {
  const spreadsheet = {
    getSheets: () => [createSheet("products")],
  };

  assert.equal(
    script.validateLocalizationSheetName("  inventory  ", spreadsheet),
    "inventory",
  );
  assert.throws(
    () => script.validateLocalizationSheetName("Products", spreadsheet),
    /already exists|уже существует/,
  );
  assert.throws(
    () => script.validateLocalizationSheetName("template", spreadsheet),
    /зарезервировано/,
  );
  assert.throws(
    () => script.validateLocalizationSheetName("", spreadsheet),
    /пустым/,
  );
  assert.throws(
    () => script.validateLocalizationSheetName("x".repeat(101), spreadsheet),
    /100/,
  );
  assert.throws(
    () => script.validateLocalizationSheetName("LOCALES", spreadsheet),
    /зарезервировано/,
  );
  for (const character of [":", "\\", "/", "?", "*", "[", "]"]) {
    assert.throws(
      () =>
        script.validateLocalizationSheetName(
          `invalid${character}name`,
          spreadsheet,
        ),
      /не может содержать/,
    );
  }
});

test("new localization sheet is created as a complete template copy", () => {
  const createdSheet = {
    setName(name) {
      this.name = name;
      return this;
    },
  };
  const template = {
    copyTo: () => createdSheet,
  };
  const existingSheets = [createSheet("template"), createSheet("products")];
  const toasts = [];
  let activeSheet;
  const spreadsheet = createTargetSpreadsheet({
    getSheetByName: (name) => (name === "template" ? template : null),
    getSheets: () => existingSheets,
    setActiveSheet: (sheet) => {
      activeSheet = sheet;
    },
    toast: (message) => toasts.push(message),
  });
  const ui = {
    Button: { OK: "OK" },
    ButtonSet: { OK_CANCEL: "OK_CANCEL" },
    prompt: () => ({
      getSelectedButton: () => "OK",
      getResponseText: () => "inventory",
    }),
  };
  const createScript = loadAppsScript(["config.js", "sheets.js"], {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => ui,
    },
  });

  createScript.createLocalizationSheetFromTemplate();

  assert.equal(createdSheet.name, "inventory");
  assert.equal(activeSheet, createdSheet);
  assert.match(toasts[0], /inventory/);
});

test("canceling new sheet creation does not copy template", () => {
  let copyCount = 0;
  const template = {
    copyTo() {
      copyCount++;
      throw new Error("template must not be copied after cancel");
    },
  };
  const spreadsheet = createTargetSpreadsheet({
    getSheetByName: () => template,
  });
  const ui = {
    Button: { CANCEL: "CANCEL", OK: "OK" },
    ButtonSet: { OK_CANCEL: "OK_CANCEL" },
    prompt: () => ({
      getSelectedButton: () => "CANCEL",
      getResponseText: () => "ignored",
    }),
  };
  const cancelScript = loadAppsScript(["config.js", "sheets.js"], {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      getUi: () => ui,
    },
  });

  cancelScript.createLocalizationSheetFromTemplate();

  assert.equal(copyCount, 0);
});

test("new sheet creation fails before prompting when template is missing", () => {
  let promptCount = 0;
  const missingTemplateScript = loadAppsScript(["config.js", "sheets.js"], {
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        createTargetSpreadsheet({ getSheetByName: () => null }),
      getUi: () => ({
        prompt: () => {
          promptCount++;
        },
      }),
    },
  });

  assert.throws(
    () => missingTemplateScript.createLocalizationSheetFromTemplate(),
    /Sheet "template" not found/,
  );
  assert.equal(promptCount, 0);
});

test("localization header indexes the source schema", () => {
  const indexes = script.indexLocalizationHeader([
    "label",
    "description",
    "meta",
    "ru",
    "en",
    "kk",
    "be",
  ]);

  assert.equal(indexes.label, 0);
  assert.equal(indexes.description, 1);
  assert.equal(indexes.meta, 2);
  assert.equal(indexes.ru, 3);
  assert.equal(indexes.source, 3);
});

test("language detection starts after ru and normalizes locale codes", () => {
  const columns = JSON.parse(
    JSON.stringify(
      script.getLocalizationColumns(
        ["label", "description", "meta", "ru", "en", "pt-BR", "invalid locale"],
        3,
      ),
    ),
  );

  assert.deepEqual(columns, [
    { code: "en", columnIndex: 4, header: "en" },
    { code: "pt_BR", columnIndex: 5, header: "pt-BR" },
  ]);
});

test("missing required header is rejected", () => {
  assert.throws(
    () =>
      script.indexLocalizationHeader(["label", "description", "meta", "en"]),
    /Required header column is missing: "ru"/,
  );
});
