import assert from "node:assert/strict";
import test from "node:test";

import { loadAppsScript } from "../test-support/load-apps-script.js";

function createScript() {
  const notes = [];
  const script = loadAppsScript(
    ["config.js", "sheets.js", "api-translation.js"],
    {
      SpreadsheetApp: {
        getActiveSheet: () => ({
          getRange: (row, column) => ({
            setNote: (message) => notes.push({ row, column, message }),
          }),
        }),
      },
    },
  );
  return { notes, script };
}

function requestItem(label = "saveButton") {
  return {
    label,
    sheetRow: 2,
    targets: [
      { code: "en", columnIndex: 4 },
      { code: "kk", columnIndex: 5 },
    ],
    payload: {
      label,
      ru: "Сохранить",
      languages: ["en", "kk"],
    },
  };
}

test("API request builder includes only empty target locales and keeps context", () => {
  const { script } = createScript();
  const headers = ["label", "description", "meta", "ru", "en", "kk"];
  const indexes = script.indexLocalizationHeader(headers);
  const languages = script.getLocalizationColumns(headers, indexes.source);
  const result = script.buildApiTranslationRows({
    indexes,
    languages,
    values: [
      headers,
      [
        "welcomeMessage",
        "Shown on the dashboard",
        '{"placeholders":["name"]}',
        "Добро пожаловать, {name}",
        "",
        "Қош келдіңіз, {name}",
      ],
      ["saveButton", "Primary action", "", "Сохранить", "Save", "Сақтау"],
    ],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    {
      label: "welcomeMessage",
      sheetRow: 2,
      targets: [{ code: "en", columnIndex: 4 }],
      payload: {
        label: "welcomeMessage",
        description: "Shown on the dashboard",
        meta: { placeholders: ["name"] },
        ru: "Добро пожаловать, {name}",
        languages: ["en"],
      },
    },
  ]);
});

test("API request builder rejects duplicate labels before sending data", () => {
  const { notes, script } = createScript();
  const headers = ["label", "description", "meta", "ru", "en"];
  const indexes = script.indexLocalizationHeader(headers);
  const languages = script.getLocalizationColumns(headers, indexes.source);

  assert.throws(
    () =>
      script.buildApiTranslationRows({
        indexes,
        languages,
        values: [
          headers,
          ["saveButton", "", "", "Сохранить", ""],
          ["saveButton", "", "", "Сохранить снова", ""],
        ],
      }),
    /Duplicate label found: "saveButton" \(row 3\)/,
  );
  assert.deepEqual(notes, [
    {
      row: 3,
      column: 1,
      message: 'Duplicate label: "saveButton". Must be unique.',
    },
  ]);
});

test("valid API batch response is normalized", () => {
  const { script } = createScript();
  const result = script.validateApiBatchResponse(
    {
      data: [
        {
          label: "saveButton",
          localization: {
            en: { text: "Save" },
            kk: "Сақтау",
          },
        },
      ],
    },
    [requestItem()],
  );

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    {
      label: "saveButton",
      localization: { en: "Save", kk: "Сақтау" },
    },
  ]);
});

test("response missing a requested label is rejected", () => {
  const { notes, script } = createScript();

  assert.throws(
    () => script.validateApiBatchResponse({ data: [] }, [requestItem()]),
    /missing label "saveButton"/,
  );
  assert.equal(notes.length, 1);
});

test("response missing a requested language is rejected", () => {
  const { notes, script } = createScript();

  assert.throws(
    () =>
      script.validateApiBatchResponse(
        {
          data: [
            {
              label: "saveButton",
              localization: { en: { text: "Save" } },
            },
          ],
        },
        [requestItem()],
      ),
    /missing translations for kk/,
  );
  assert.equal(notes.length, 1);
});

test("response with an unexpected label or language is rejected", () => {
  const { script } = createScript();

  assert.throws(
    () =>
      script.validateApiBatchResponse(
        {
          data: [
            {
              label: "otherLabel",
              localization: { en: "Other", kk: "Басқа" },
            },
          ],
        },
        [requestItem()],
      ),
    /unexpected label "otherLabel"/,
  );

  assert.throws(
    () =>
      script.validateApiBatchResponse(
        {
          data: [
            {
              label: "saveButton",
              localization: { en: "Save", kk: "Сақтау", be: "Захаваць" },
            },
          ],
        },
        [requestItem()],
      ),
    /unexpected languages: be/,
  );
});

test("RGB configuration accepts only complete byte values", () => {
  const { script } = createScript();

  assert.deepEqual(
    JSON.parse(JSON.stringify(script.parseRgbColor("220,255,220"))),
    {
      red: 220,
      green: 255,
      blue: 220,
    },
  );
  assert.equal(script.parseRgbColor("220,999,220"), null);
  assert.equal(script.parseRgbColor("220,255"), null);
});
