import assert from "node:assert/strict";
import test from "node:test";

import {
  createTargetSpreadsheet,
  loadAppsScript,
} from "../test-support/load-apps-script.js";

const headers = ["label", "description", "meta", "ru", "en", "kk"];

function createSheet(
  values,
  formulas = values.map((row) => row.map(() => "")),
) {
  const rangeMatrix = (source, row, column, rowCount, columnCount) =>
    Array.from({ length: rowCount }, (_, rowOffset) =>
      Array.from(
        { length: columnCount },
        (_, columnOffset) =>
          source[row - 1 + rowOffset][column - 1 + columnOffset],
      ),
    );

  return {
    formulas,
    values,
    getDataRange: () => ({ getValues: () => values.map((row) => [...row]) }),
    getLastRow: () => values.length,
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        clearContent() {
          values[row - 1][column - 1] = "";
          formulas[row - 1][column - 1] = "";
          return this;
        },
        getFormulas: () =>
          rangeMatrix(formulas, row, column, rowCount, columnCount),
        getValues: () =>
          rangeMatrix(values, row, column, rowCount, columnCount),
        setFormula(formula) {
          formulas[row - 1][column - 1] = formula;
          return this;
        },
        setValue(value) {
          values[row - 1][column - 1] = value;
          formulas[row - 1][column - 1] = "";
          return this;
        },
      };
    },
  };
}

function createScript(sheet) {
  const toasts = [];
  const script = loadAppsScript(
    ["config.js", "sheets.js", "google-translate.js"],
    {
      SpreadsheetApp: {
        getActiveSheet: () => sheet,
        getActiveSpreadsheet: () =>
          createTargetSpreadsheet({
            getActiveSheet: () => sheet,
            toast: (message) => toasts.push(message),
          }),
      },
    },
  );

  return { script, toasts };
}

test("formula fill changes only empty target cells", () => {
  const values = [
    headers,
    ["save", "", "", "Сохранить", "", "Сақтау"],
    ["cancel", "", "", "Отмена", "custom result", ""],
  ];
  const formulas = values.map((row) => row.map(() => ""));
  formulas[2][4] = "=CUSTOM_TRANSLATE(D3)";
  const sheet = createSheet(values, formulas);
  const { script, toasts } = createScript(sheet);

  script.fillGoogleTranslateFormulas();

  assert.equal(formulas[1][4], '=IF($D2="","",GOOGLETRANSLATE($D2,"ru","en"))');
  assert.equal(formulas[2][4], "=CUSTOM_TRANSLATE(D3)");
  assert.equal(values[1][5], "Сақтау");
  assert.equal(formulas[2][5], '=IF($D3="","",GOOGLETRANSLATE($D3,"ru","kk"))');
  assert.match(toasts.at(-1), /2/);
});

test("formula freeze replaces only GOOGLETRANSLATE formulas with values", () => {
  const values = [
    headers,
    ["save", "", "", "Сохранить", "Save", "Сақтау"],
    ["cancel", "", "", "Отмена", 3, "Болдырмау"],
  ];
  const formulas = values.map((row) => row.map(() => ""));
  formulas[1][4] = '=GOOGLETRANSLATE(D2,"ru","en")';
  formulas[2][4] = "=SUM(1,2)";
  formulas[2][5] = '=IF(D3="","",googletranslate(D3,"ru","kk"))';
  const sheet = createSheet(values, formulas);
  const { script, toasts } = createScript(sheet);

  script.freezeGoogleTranslateFormulas();

  assert.equal(values[1][4], "Save");
  assert.equal(formulas[1][4], "");
  assert.equal(values[2][4], 3);
  assert.equal(formulas[2][4], "=SUM(1,2)");
  assert.equal(values[2][5], "Болдырмау");
  assert.equal(formulas[2][5], "");
  assert.match(toasts.at(-1), /2/);
});

test("formula clear removes only GOOGLETRANSLATE formula cells", () => {
  const values = [
    headers,
    ["save", "", "", "Сохранить", "Save", "Сақтау"],
    ["cancel", "", "", "Отмена", 3, "Болдырмау"],
  ];
  const formulas = values.map((row) => row.map(() => ""));
  formulas[1][4] = '=GOOGLETRANSLATE(D2,"ru","en")';
  formulas[2][4] = "=SUM(1,2)";
  formulas[2][5] = '=IF(D3="","",GOOGLETRANSLATE(D3,"ru","kk"))';
  const sheet = createSheet(values, formulas);
  const { script, toasts } = createScript(sheet);

  script.clearGoogleTranslateFormulas();

  assert.equal(values[1][4], "");
  assert.equal(formulas[1][4], "");
  assert.equal(values[2][4], 3);
  assert.equal(formulas[2][4], "=SUM(1,2)");
  assert.equal(values[2][5], "");
  assert.equal(formulas[2][5], "");
  assert.match(toasts.at(-1), /2/);
});
