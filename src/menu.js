/** Adds the localization menu when the spreadsheet is opened. */
function onOpen() {
  assertTargetSpreadsheet();
  SpreadsheetApp.getUi()
    .createMenu("Локализация")
    .addItem("Создать лист из template", "createLocalizationSheetFromTemplate")
    .addSeparator()
    .addItem("Перевести пустые ячейки через API", "runLocalization")
    .addItem(
      "Перевести пустые ячейки через Google Translate",
      "translateEmptyCellsToAllLanguages",
    )
    .addSeparator()
    .addItem("Заполнить формулы GOOGLETRANSLATE", "fillGoogleTranslateFormulas")
    .addItem(
      "Зафиксировать формулы GOOGLETRANSLATE",
      "freezeGoogleTranslateFormulas",
    )
    .addItem("Удалить формулы GOOGLETRANSLATE", "clearGoogleTranslateFormulas")
    .addSeparator()
    .addItem("Добавить новые локали из template", "syncColumnsFromTemplate")
    .addItem(
      "Синхронизировать условное форматирование",
      "syncConditionalFormatting",
    )
    .addItem("Синхронизировать всё из template", "syncLocalizationTemplate")
    .addSeparator()
    .addItem("Сортировать текущий лист", "sortCurrentSheet")
    .addItem("Очистить подсветку переводов", "clearLocalizationHighlight")
    .addToUi();
}
