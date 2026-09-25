import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("all production entrypoints from the current Apps Script remain available", () => {
  const source = [
    "menu.js",
    "sheets.js",
    "google-translate.js",
    "api-translation.js",
  ]
    .map((file) => readFileSync(`${projectRoot}/src/${file}`, "utf8"))
    .join("\n");
  const functionNames = new Set(
    Array.from(
      source.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm),
      (match) => match[1],
    ),
  );
  // Captured from the live Cardhub Apps Script before the repository became
  // its source of truth.
  const currentProductionFunctions = [
    "onOpen",
    "syncLocalizationTemplate",
    "translateEmptyCellsToAllLanguages",
    "translateEmptyCellsForLanguage",
    "translateWithRetry",
    "isTranslationRateLimitError",
    "isStructuredLocalizationString",
    "showToast",
    "syncCF",
    "syncColumnsFromTemplate",
    "syncSheetColumns",
    "copyTemplateColumn",
    "translatePreservingLineBreaks",
    "translateIcuPlural",
    "TRANSLATE_RU_ONLY",
  ];

  assert.deepEqual(
    currentProductionFunctions.filter((name) => !functionNames.has(name)),
    [],
  );
});
