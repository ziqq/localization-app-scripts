import assert from "node:assert/strict";
import test from "node:test";

import {
  createTargetSpreadsheet,
  loadAppsScript,
} from "../test-support/load-apps-script.js";

function createMenuRecorder() {
  const entries = [];
  const state = { addedToUi: false, menuName: undefined };
  const menu = {
    addItem(label, handler) {
      entries.push({ handler, label });
      return this;
    },
    addSeparator() {
      entries.push(null);
      return this;
    },
    addToUi() {
      state.addedToUi = true;
    },
  };
  const ui = {
    createMenu(name) {
      state.menuName = name;
      return menu;
    },
  };

  return { entries, state, ui };
}

test("onOpen publishes every production command with its expected handler", () => {
  const { entries, state, ui } = createMenuRecorder();
  const script = loadAppsScript(["config.js", "menu.js"], {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => createTargetSpreadsheet(),
      getUi: () => ui,
    },
  });

  script.onOpen();

  assert.equal(state.menuName, "Локализация");
  assert.equal(state.addedToUi, true);
  assert.deepEqual(
    entries.filter(Boolean),
    [
      ["Создать лист из template", "createLocalizationSheetFromTemplate"],
      ["Перевести пустые ячейки через API", "runLocalization"],
      [
        "Перевести пустые ячейки через Google Translate",
        "translateEmptyCellsToAllLanguages",
      ],
      ["Заполнить формулы GOOGLETRANSLATE", "fillGoogleTranslateFormulas"],
      [
        "Зафиксировать формулы GOOGLETRANSLATE",
        "freezeGoogleTranslateFormulas",
      ],
      ["Удалить формулы GOOGLETRANSLATE", "clearGoogleTranslateFormulas"],
      ["Добавить новые локали из template", "syncColumnsFromTemplate"],
      ["Синхронизировать условное форматирование", "syncConditionalFormatting"],
      ["Синхронизировать всё из template", "syncLocalizationTemplate"],
      ["Сортировать текущий лист", "sortCurrentSheet"],
      ["Очистить подсветку переводов", "clearLocalizationHighlight"],
    ].map(([label, handler]) => ({ handler, label })),
  );
  assert.equal(entries.filter((entry) => entry === null).length, 4);
});

test("onOpen refuses a spreadsheet other than the deployment target", () => {
  const { state, ui } = createMenuRecorder();
  const script = loadAppsScript(["config.js", "menu.js"], {
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        createTargetSpreadsheet({ getId: () => "another_spreadsheet_id" }),
      getUi: () => ui,
    },
  });

  assert.throws(() => script.onOpen(), /Операция разрешена только/);
  assert.equal(state.addedToUi, false);
});

test("onOpen refuses to run when the deployment target is not generated", () => {
  const { state, ui } = createMenuRecorder();
  const script = loadAppsScript(["config.js", "menu.js"], {
    TARGET_SPREADSHEET: undefined,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => createTargetSpreadsheet(),
      getUi: () => ui,
    },
  });

  assert.throws(() => script.onOpen(), /не настроена/);
  assert.equal(state.addedToUi, false);
});
