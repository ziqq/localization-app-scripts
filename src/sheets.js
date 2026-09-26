/** Returns sheets that have the localization schema and are not metadata sheets. */
function getTargetSheets(spreadsheet) {
  assertTargetSpreadsheet(spreadsheet);
  const ignoredNames = new Set(LOCALIZATION_CONFIG.ignoredSheetNames);
  return spreadsheet
    .getSheets()
    .filter((sheet) => !ignoredNames.has(sheet.getName()))
    .filter(hasLocalizationSchema);
}

function hasLocalizationSchema(sheet) {
  const headers = new Set(
    getSheetHeaders(sheet).map((value) => value.toLowerCase()),
  );
  return [
    "label",
    "description",
    "meta",
    LOCALIZATION_CONFIG.sourceLanguage,
  ].every((name) => headers.has(name.toLowerCase()));
}

/** Creates a new localization sheet as a complete copy of template. */
function createLocalizationSheetFromTemplate() {
  const spreadsheet = assertTargetSpreadsheet();
  const template = spreadsheet.getSheetByName(
    LOCALIZATION_CONFIG.templateSheet,
  );
  if (!template) {
    throw new Error(`Sheet "${LOCALIZATION_CONFIG.templateSheet}" not found`);
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Новый лист локализации",
    "Введите имя листа",
    ui.ButtonSet.OK_CANCEL,
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const sheetName = validateLocalizationSheetName(
    response.getResponseText(),
    spreadsheet,
  );
  const sheet = template.copyTo(spreadsheet).setName(sheetName);
  spreadsheet.setActiveSheet(sheet);
  showToast(`Лист "${sheetName}" создан из template`);
}

function validateLocalizationSheetName(value, spreadsheet) {
  const sheetName = safeString(value);
  if (!sheetName) throw new Error("Имя листа не может быть пустым");
  if (sheetName.length > 100) {
    throw new Error("Имя листа не может быть длиннее 100 символов");
  }
  if (
    [":", "\\", "/", "?", "*", "[", "]"].some((character) =>
      sheetName.includes(character),
    )
  ) {
    throw new Error("Имя листа не может содержать символы : \\ / ? * [ ]");
  }

  const normalizedName = sheetName.toLowerCase();
  if (
    LOCALIZATION_CONFIG.ignoredSheetNames.some(
      (name) => name.toLowerCase() === normalizedName,
    )
  ) {
    throw new Error(`Имя "${sheetName}" зарезервировано`);
  }
  if (
    spreadsheet
      .getSheets()
      .some((sheet) => sheet.getName().toLowerCase() === normalizedName)
  ) {
    throw new Error(`Лист "${sheetName}" уже существует`);
  }

  return sheetName;
}

function getSheetHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];

  return sheet
    .getRange(LOCALIZATION_CONFIG.headerRow, 1, 1, lastColumn)
    .getDisplayValues()[0]
    .map((value) => String(value || "").trim());
}

function indexLocalizationHeader(header) {
  const requiredNames = [
    "label",
    "description",
    "meta",
    LOCALIZATION_CONFIG.sourceLanguage,
  ];
  const indexes = {};

  for (const name of requiredNames) {
    const index = header.findIndex(
      (value) => value.toLowerCase() === name.toLowerCase(),
    );
    if (index === -1) {
      throw new Error(`Required header column is missing: "${name}".`);
    }
    indexes[name] = index;
  }

  indexes.source = indexes[LOCALIZATION_CONFIG.sourceLanguage];
  return indexes;
}

function getLocalizationColumns(header, sourceColumnIndex) {
  const languagePattern = /^[a-z]{2,3}(?:[_-][A-Z]{2})?$/;
  const columns = [];

  for (let index = sourceColumnIndex + 1; index < header.length; index++) {
    const rawCode = String(header[index] || "").trim();
    if (!languagePattern.test(rawCode)) continue;

    columns.push({
      code: normalizeLanguageCode(rawCode),
      columnIndex: index,
      header: rawCode,
    });
  }

  return columns;
}

function normalizeLanguageCode(value) {
  const parts = String(value).split(/[_-]/);
  if (parts.length === 1) return parts[0].toLowerCase();
  return `${parts[0].toLowerCase()}_${parts[1].toUpperCase()}`;
}

function safeString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readActiveLocalizationSheet() {
  assertTargetSpreadsheet();
  const sheet = SpreadsheetApp.getActiveSheet();
  const values = sheet.getDataRange().getValues();
  return { sheet, values };
}

function setRowNote(row, column, message) {
  SpreadsheetApp.getActiveSheet()
    .getRange(row, column || 1)
    .setNote(message);
}

function showToast(message, title = "Локализация", timeoutSeconds = 5) {
  SpreadsheetApp.getActiveSpreadsheet().toast(message, title, timeoutSeconds);
}

/** Sorts localization rows on the active sheet by the configured column. */
function sortCurrentSheet() {
  const spreadsheet = assertTargetSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const headerRow = LOCALIZATION_CONFIG.headerRow;
  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastRow <= headerRow || lastColumn === 0) return;

  const headers = getSheetHeaders(sheet).map((value) => value.toLowerCase());
  const configuredColumn =
    LOCALIZATION_CONFIG.sortColumnBySheet[sheet.getName()] ||
    LOCALIZATION_CONFIG.defaultSortColumn;
  const sortColumnIndex = headers.indexOf(configuredColumn.toLowerCase());

  if (sortColumnIndex === -1) {
    throw new Error(
      `Не найдена колонка сортировки "${configuredColumn}" на листе "${sheet.getName()}"`,
    );
  }

  const sortSpec = [{ column: sortColumnIndex + 1, ascending: true }];
  const labelColumnIndex = headers.indexOf("label");

  if (configuredColumn !== "label" && labelColumnIndex !== -1) {
    sortSpec.push({ column: labelColumnIndex + 1, ascending: true });
  }

  sheet
    .getRange(headerRow + 1, 1, lastRow - headerRow, lastColumn)
    .sort(sortSpec);
}

function syncLocalizationTemplate() {
  syncColumnsFromTemplate();
  syncConditionalFormatting();
}

/** Adds missing columns from template to every domain sheet. */
function syncColumnsFromTemplate() {
  const spreadsheet = assertTargetSpreadsheet();
  const template = spreadsheet.getSheetByName(
    LOCALIZATION_CONFIG.templateSheet,
  );

  if (!template) {
    throw new Error(`Sheet "${LOCALIZATION_CONFIG.templateSheet}" not found`);
  }

  const templateHeaders = getSheetHeaders(template);

  for (const sheet of getTargetSheets(spreadsheet)) {
    syncSheetColumns({ template, sheet, templateHeaders });
  }

  showToast("Новые колонки добавлены на все листы");
}

function syncSheetColumns({ template, sheet, templateHeaders }) {
  const currentHeaders = getSheetHeaders(sheet);

  templateHeaders.forEach((header, templateIndex) => {
    if (!header || currentHeaders.includes(header)) return;

    const columnNumber = templateIndex + 1;
    if (columnNumber > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        columnNumber - sheet.getMaxColumns(),
      );
    } else {
      sheet.insertColumnBefore(columnNumber);
    }

    ensureSheetSize(sheet, template.getMaxRows(), columnNumber);
    copyTemplateColumn({ template, sheet, columnNumber });
    currentHeaders.splice(templateIndex, 0, header);
    Logger.log(`Added column "${header}" to sheet "${sheet.getName()}"`);
  });
}

function ensureSheetSize(sheet, minimumRows, minimumColumns) {
  if (sheet.getMaxRows() < minimumRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), minimumRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < minimumColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      minimumColumns - sheet.getMaxColumns(),
    );
  }
}

function copyTemplateColumn({ template, sheet, columnNumber }) {
  const rowCount = template.getMaxRows();
  const sourceRange = template.getRange(1, columnNumber, rowCount, 1);
  const targetRange = sheet.getRange(1, columnNumber, rowCount, 1);

  sourceRange.copyTo(
    targetRange,
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false,
  );
  sourceRange.copyTo(
    targetRange,
    SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,
    false,
  );
  sheet
    .getRange(1, columnNumber)
    .setValue(template.getRange(1, columnNumber).getValue());
  sheet.setColumnWidth(columnNumber, template.getColumnWidth(columnNumber));
}

/** Replaces conditional-format rules on every domain sheet with rules from template. */
function syncConditionalFormatting() {
  const spreadsheet = assertTargetSpreadsheet();
  const template = spreadsheet.getSheetByName(
    LOCALIZATION_CONFIG.templateSheet,
  );

  if (!template) {
    throw new Error(`Sheet "${LOCALIZATION_CONFIG.templateSheet}" not found`);
  }

  const templateRules = template.getConditionalFormatRules();
  const separator = getFormulaArgumentSeparator(templateRules);

  for (const sheet of getTargetSheets(spreadsheet)) {
    ensureSheetSize(sheet, template.getMaxRows(), template.getMaxColumns());
    const targetRules = templateRules.map((rule) => {
      const ranges = rule
        .getRanges()
        .map((range) => sheet.getRange(range.getA1Notation()));
      return rule.copy().setRanges(ranges).build();
    });
    sheet.setConditionalFormatRules([
      ...createScriptCheckRules(sheet, separator),
      ...targetRules,
    ]);
  }

  showToast("Условное форматирование синхронизировано");
}

/**
 * Returns the formula argument separator used by the spreadsheet locale,
 * inferred from the template's custom-formula rules.
 */
function getFormulaArgumentSeparator(rules) {
  const usesSemicolon = rules.some((rule) => {
    const condition = rule.getBooleanCondition();
    if (!condition) return false;
    return condition
      .getCriteriaValues()
      .some((value) => typeof value === "string" && value.includes(";"));
  });
  return usesSemicolon ? ";" : ",";
}

/**
 * Builds rules that highlight translations written in a foreign alphabet:
 * mostly Cyrillic text in non-Cyrillic languages, mostly Latin text in
 * Cyrillic languages, and Russian-only letters where the alphabet lacks them.
 * Adjacent columns with the same check share one rule.
 */
function createScriptCheckRules(sheet, separator) {
  const header = getSheetHeaders(sheet);
  const indexes = indexLocalizationHeader(header);
  const rowCount = sheet.getMaxRows() - LOCALIZATION_CONFIG.headerRow;
  if (rowCount < 1) return [];

  const groups = [];
  for (const language of getLocalizationColumns(header, indexes.source)) {
    const code = language.code.split("_")[0];
    const check = isPlainNonCyrillic(code) ? "cyrillic" : code;
    const last = groups[groups.length - 1];
    if (last && last.check === check && last.end === language.columnIndex - 1) {
      last.end = language.columnIndex;
    } else {
      groups.push({
        check,
        code,
        start: language.columnIndex,
        end: language.columnIndex,
      });
    }
  }

  return groups.map((group) => {
    const firstRow = LOCALIZATION_CONFIG.headerRow + 1;
    const cell = `${columnToLetter(group.start + 1)}${firstRow}`;
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        buildScriptCheckFormula(group.code, cell, separator),
      )
      .setBackground(SCRIPT_CHECK_CONFIG.background)
      .setFontColor(SCRIPT_CHECK_CONFIG.fontColor)
      .setRanges([
        sheet.getRange(
          firstRow,
          group.start + 1,
          rowCount,
          group.end - group.start + 1,
        ),
      ])
      .build();
  });
}

function isPlainNonCyrillic(code) {
  return !SCRIPT_CHECK_CONFIG.cyrillicLanguages.includes(code);
}

function buildScriptCheckFormula(code, cell, separator) {
  const s = separator;
  const count = (pattern) => `LEN(REGEXREPLACE(${cell}${s}"${pattern}"${s}""))`;

  if (isPlainNonCyrillic(code)) {
    return `=${count("[^\\p{Cyrillic}]")}>${count("[\\p{Cyrillic}\\P{L}]")}`;
  }

  const latinDominates = `${count("[^\\p{Latin}]")}>${count("[^\\p{Cyrillic}]")}`;
  const letters = SCRIPT_CHECK_CONFIG.foreignLetters[code];
  if (!letters) return `=${latinDominates}`;
  return `=OR(${latinDominates}${s}REGEXMATCH(${cell}${s}"[${letters}]"))`;
}

/** Backward-compatible function name used by the current production menu. */
function syncCF() {
  syncConditionalFormatting();
}
