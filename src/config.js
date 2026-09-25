const LOCALIZATION_CONFIG = Object.freeze({
  headerRow: 1,
  sourceLanguage: "ru",
  defaultSortColumn: "label",
  sortColumnBySheet: Object.freeze({}),
  templateSheet: "template",
  ignoredSheetNames: Object.freeze(["template", "locales"]),
});

const TRANSLATION_CONFIG = Object.freeze({
  requestDelayMs: 250,
  maxAttempts: 5,
  retryDelayMs: 1000,
});

const API_DEFAULTS = Object.freeze({
  API_URL: "",
  API_KEY: "",
  BATCH_SIZE: "3",
  RETRY_MAX: "2",
  RETRY_DELAY_MS: "1000",
  HIGHLIGHT_COLOR: "220,255,220",
  HIGHLIGHT_CLEAR_MINUTES: "1",
  DRY_RUN: "false",
});

const HIGHLIGHT_CONTEXT_PROPERTY = "LOCALIZATION_HIGHLIGHT_CONTEXT";

/**
 * Returns the bound spreadsheet only when it matches the deployment target.
 *
 * `TARGET_SPREADSHEET` is declared in `target.generated.js`, which
 * `npm run project:configure` writes from deployment secrets.
 */
function assertTargetSpreadsheet(
  spreadsheet = SpreadsheetApp.getActiveSpreadsheet(),
) {
  if (typeof TARGET_SPREADSHEET === "undefined") {
    throw new Error("Целевая таблица не настроена для этого развёртывания.");
  }

  if (
    !spreadsheet ||
    spreadsheet.getId() !== TARGET_SPREADSHEET.id ||
    spreadsheet.getName() !== TARGET_SPREADSHEET.title
  ) {
    throw new Error(
      `Операция разрешена только для таблицы ${TARGET_SPREADSHEET.title}.`,
    );
  }

  return spreadsheet;
}
