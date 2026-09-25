/** Fills empty cells for every target language on the active sheet through LanguageApp. */
function translateEmptyCellsToAllLanguages() {
  const spreadsheet = assertTargetSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const headers = getSheetHeaders(sheet);
  const indexes = indexLocalizationHeader(headers);
  const targetLanguages = getLocalizationColumns(headers, indexes.source);

  if (targetLanguages.length === 0) {
    throw new Error("Не найдены колонки языков для перевода");
  }

  spreadsheet.toast("Заполняем пустые переводы…", "Локализация", -1);

  for (const language of targetLanguages) {
    translateEmptyCellsForLanguage(language.header, false);
  }

  showToast(
    `Переводы заполнены: ${targetLanguages.map((item) => item.header).join(", ")}`,
  );
}

/** Fills empty cells for one target language without overwriting existing values. */
function translateEmptyCellsForLanguage(
  targetColumnName,
  showResultToast = true,
) {
  const spreadsheet = assertTargetSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const headerRow = LOCALIZATION_CONFIG.headerRow;
  const lastRow = sheet.getLastRow();

  if (lastRow <= headerRow) {
    if (showResultToast) showToast("На листе нет строк для перевода");
    return;
  }

  const headers = getSheetHeaders(sheet);
  const sourceColumnIndex = headers.findIndex(
    (value) =>
      value.toLowerCase() === LOCALIZATION_CONFIG.sourceLanguage.toLowerCase(),
  );
  const targetColumnIndex = headers.findIndex(
    (value) => value.toLowerCase() === targetColumnName.toLowerCase(),
  );

  if (sourceColumnIndex === -1) {
    throw new Error(
      `Не найдена колонка "${LOCALIZATION_CONFIG.sourceLanguage}"`,
    );
  }
  if (targetColumnIndex === -1) {
    throw new Error(`Не найдена колонка "${targetColumnName}"`);
  }

  const rowCount = lastRow - headerRow;
  const sourceValues = sheet
    .getRange(headerRow + 1, sourceColumnIndex + 1, rowCount, 1)
    .getDisplayValues();
  const targetRange = sheet.getRange(
    headerRow + 1,
    targetColumnIndex + 1,
    rowCount,
    1,
  );
  const targetValues = targetRange.getValues();
  let translatedCount = 0;

  const result = targetValues.map((targetRow, index) => {
    const sourceText = sourceValues[index][0];
    const targetText = safeString(targetRow[0]);
    if (!safeString(sourceText) || targetText) return targetRow;

    const translatedText = isStructuredLocalizationString(sourceText)
      ? translateIcuPlural(
          sourceText,
          LOCALIZATION_CONFIG.sourceLanguage,
          targetColumnName,
        )
      : translatePreservingLineBreaks(
          sourceText,
          LOCALIZATION_CONFIG.sourceLanguage,
          targetColumnName,
        );

    translatedCount++;
    return [translatedText];
  });

  targetRange.setValues(result);

  if (showResultToast) {
    showToast(`${targetColumnName}: заполнено ${translatedCount}`);
  }
}

function isStructuredLocalizationString(value) {
  return /\{\s*\w+\s*,\s*plural\s*,/i.test(value);
}

function translatePreservingLineBreaks(text, sourceLanguage, targetLanguage) {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "";
      return translateTextWithPlaceholders(
        line,
        sourceLanguage,
        targetLanguage,
      );
    })
    .join("\n");
}

function translateTextWithPlaceholders(text, sourceLanguage, targetLanguage) {
  const placeholders = [];
  const protectedText = text.replace(
    /\{[A-Za-z_][A-Za-z0-9_]*\}/g,
    (placeholder) => {
      const marker = createProtectionMarker(placeholders.length, 0xe000);
      placeholders.push(placeholder);
      return marker;
    },
  );
  const translatedText = translateWithRetry(
    protectedText,
    sourceLanguage,
    targetLanguage,
  );
  return restoreProtectedValues(translatedText, placeholders, 0xe000);
}

/**
 * Translates text through LanguageApp, pausing between requests and retrying
 * rate-limit failures with exponential backoff (1, 2, 4, 8 seconds).
 * Other failures are rethrown immediately.
 */
function translateWithRetry(text, sourceLanguage, targetLanguage) {
  if (!text.trim()) {
    return text;
  }

  const { requestDelayMs, maxAttempts, retryDelayMs } = TRANSLATION_CONFIG;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const translatedText = LanguageApp.translate(
        text,
        sourceLanguage,
        targetLanguage,
      );
      Utilities.sleep(requestDelayMs);
      return translatedText;
    } catch (error) {
      const message = String(error);

      if (!isTranslationRateLimitError(message)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        throw new Error(
          [
            `Не удалось перевести текст на "${targetLanguage}".`,
            `Количество попыток: ${maxAttempts}.`,
            `Последняя ошибка: ${message}`,
          ].join(" "),
        );
      }

      Utilities.sleep(retryDelayMs * Math.pow(2, attempt - 1));
    }
  }

  throw new Error(`Не удалось перевести текст на "${targetLanguage}"`);
}

/** Detects Russian and English Apps Script rate-limit messages. */
function isTranslationRateLimitError(message) {
  const normalizedMessage = message.toLowerCase();

  return [
    "слишком много раз",
    "короткий период времени",
    "too many times",
    "too many requests",
    "service invoked too many times",
    "rate limit",
    "try utilities.sleep",
  ].some((fragment) => normalizedMessage.includes(fragment));
}

function translateIcuPlural(text, sourceLanguage, targetLanguage) {
  return translateStructuredText(text, sourceLanguage, targetLanguage);
}

function translateStructuredText(text, sourceLanguage, targetLanguage) {
  const blocks = findIcuPluralBlocks(text);
  if (blocks.length === 0) {
    return translatePreservingLineBreaks(text, sourceLanguage, targetLanguage);
  }

  const translatedBlocks = [];
  let cursor = 0;
  let protectedText = "";

  for (const block of blocks) {
    protectedText += text.slice(cursor, block.start);
    const marker = createProtectionMarker(translatedBlocks.length, 0xf000);
    translatedBlocks.push(
      translateIcuPluralBlock(block.value, sourceLanguage, targetLanguage),
    );
    protectedText += marker;
    cursor = block.end;
  }

  protectedText += text.slice(cursor);
  const translatedText = translatePreservingLineBreaks(
    protectedText,
    sourceLanguage,
    targetLanguage,
  );
  return restoreProtectedValues(translatedText, translatedBlocks, 0xf000);
}

function findIcuPluralBlocks(text) {
  const blocks = [];
  const pattern = /\{\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*plural\s*,/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const closingBraceIndex = findMatchingBrace(text, match.index);
    if (closingBraceIndex === -1) {
      throw new Error(`Незакрытая ICU plural-конструкция: ${text}`);
    }

    blocks.push({
      start: match.index,
      end: closingBraceIndex + 1,
      value: text.slice(match.index, closingBraceIndex + 1),
    });
    pattern.lastIndex = closingBraceIndex + 1;
  }

  return blocks;
}

function translateIcuPluralBlock(block, sourceLanguage, targetLanguage) {
  const header = /^\{\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*plural\s*,/i.exec(block);
  if (!header) throw new Error(`Некорректный ICU plural-блок: ${block}`);

  const selectorPattern = /(=\d+|zero|one|two|few|many|other)\s*\{/gi;
  let cursor = header[0].length;
  let result = block.slice(0, cursor);
  let selectorMatch;

  while ((selectorMatch = selectorPattern.exec(block)) !== null) {
    if (selectorMatch.index < cursor) continue;

    const openingBraceIndex =
      selectorMatch.index + selectorMatch[0].lastIndexOf("{");
    const closingBraceIndex = findMatchingBrace(block, openingBraceIndex);
    if (closingBraceIndex === -1) {
      throw new Error(`Незакрытая ветка ICU plural: ${block}`);
    }

    result += block.slice(cursor, openingBraceIndex + 1);
    result += translateStructuredText(
      block.slice(openingBraceIndex + 1, closingBraceIndex),
      sourceLanguage,
      targetLanguage,
    );
    result += "}";
    cursor = closingBraceIndex + 1;
    selectorPattern.lastIndex = cursor;
  }

  return result + block.slice(cursor);
}

function findMatchingBrace(text, openingBraceIndex) {
  let depth = 0;

  for (let index = openingBraceIndex; index < text.length; index++) {
    if (text[index] === "{") {
      depth++;
    } else if (text[index] === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function createProtectionMarker(index, namespace) {
  return `ZXQ_L10N_${namespace}_${index}_QXZ`;
}

function restoreProtectedValues(text, values, namespace) {
  return values.reduce((result, value, index) => {
    const marker = createProtectionMarker(index, namespace);
    if (!result.includes(marker)) {
      throw new Error(`Google Translate удалил служебный маркер ${index}`);
    }
    return result.split(marker).join(value);
  }, text);
}

function fillGoogleTranslateFormulas() {
  const { sheet, values } = readActiveLocalizationSheet();
  if (values.length < 2) throw new Error("Sheet is empty or has no data.");

  const header = values[0].map((value) => safeString(value));
  const indexes = indexLocalizationHeader(header);
  const targetLanguages = getLocalizationColumns(header, indexes.source);
  const rowCount = sheet.getLastRow() - LOCALIZATION_CONFIG.headerRow;
  const sourceColumnLetter = columnToLetter(indexes.source + 1);
  let inserted = 0;

  for (const language of targetLanguages) {
    const column = language.columnIndex + 1;
    const range = sheet.getRange(
      LOCALIZATION_CONFIG.headerRow + 1,
      column,
      rowCount,
      1,
    );
    const valuesInColumn = range.getValues();
    const formulas = range.getFormulas();
    const targetCode = language.code.split(/[_-]/)[0];

    for (let index = 0; index < rowCount; index++) {
      if (formulas[index][0] || safeString(valuesInColumn[index][0])) continue;

      const row = LOCALIZATION_CONFIG.headerRow + index + 1;
      const formula = `=IF($${sourceColumnLetter}${row}="","",GOOGLETRANSLATE($${sourceColumnLetter}${row},"${LOCALIZATION_CONFIG.sourceLanguage}","${targetCode}"))`;
      sheet.getRange(row, column).setFormula(formula);
      inserted++;
    }
  }

  showToast(`Добавлено формул GOOGLETRANSLATE: ${inserted}`);
}

function freezeGoogleTranslateFormulas() {
  mutateGoogleTranslateFormulaCells(
    (cell, value) => cell.setValue(value),
    "Зафиксировано формул",
  );
}

function clearGoogleTranslateFormulas() {
  mutateGoogleTranslateFormulaCells(
    (cell) => cell.clearContent(),
    "Удалено формул",
  );
}

function mutateGoogleTranslateFormulaCells(mutate, message) {
  const { sheet, values } = readActiveLocalizationSheet();
  if (values.length < 2) throw new Error("Sheet is empty or has no data.");

  const header = values[0].map((value) => safeString(value));
  const indexes = indexLocalizationHeader(header);
  const targetLanguages = getLocalizationColumns(header, indexes.source);
  const rowCount = sheet.getLastRow() - LOCALIZATION_CONFIG.headerRow;
  let changed = 0;

  for (const language of targetLanguages) {
    const column = language.columnIndex + 1;
    const range = sheet.getRange(
      LOCALIZATION_CONFIG.headerRow + 1,
      column,
      rowCount,
      1,
    );
    const formulas = range.getFormulas();
    const currentValues = range.getValues();

    for (let index = 0; index < rowCount; index++) {
      if (!isGoogleTranslateFormula(formulas[index][0])) continue;
      mutate(
        sheet.getRange(LOCALIZATION_CONFIG.headerRow + index + 1, column),
        currentValues[index][0],
      );
      changed++;
    }
  }

  showToast(`${message}: ${changed}`);
}

function isGoogleTranslateFormula(formula) {
  return /(^|[^A-Z])GOOGLETRANSLATE\s*\(/i.test(formula || "");
}

function columnToLetter(column) {
  let result = "";
  let value = column;

  while (value > 0) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

/** Existing custom spreadsheet function retained for compatibility. */
function TRANSLATE_RU_ONLY(text, sourceLanguage, targetLanguage) {
  if (!text) return "";

  const parts = String(text).match(
    /[А-Яа-яЁё.,!?;:«»()—-]+|[^А-Яа-яЁё.,!?;:«»()—-]+/g,
  );
  if (!parts) return text;

  return parts
    .map((part) => {
      if (!/[А-Яа-яЁё]/.test(part)) return part;

      try {
        return LanguageApp.translate(
          part.trim(),
          sourceLanguage,
          targetLanguage,
        );
      } catch (_error) {
        return part;
      }
    })
    .join("");
}
