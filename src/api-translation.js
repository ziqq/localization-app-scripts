/** Translates empty cells on the active sheet through the configured batch API. */
function runLocalization() {
  const startedAt = Date.now();
  const { sheet, values } = readActiveLocalizationSheet();

  if (values.length <= LOCALIZATION_CONFIG.headerRow) {
    throw new Error("Sheet is empty or has no data.");
  }

  const config = getApiConfig();
  if (!config.apiUrl && !config.dryRun) {
    throw new Error("API_URL is not set in Script Properties.");
  }

  const header = values[LOCALIZATION_CONFIG.headerRow - 1].map((value) =>
    safeString(value),
  );
  const indexes = indexLocalizationHeader(header);
  const languages = getLocalizationColumns(header, indexes.source);

  if (languages.length === 0) {
    throw new Error(
      `No language columns found after "${LOCALIZATION_CONFIG.sourceLanguage}".`,
    );
  }

  const requestRows = buildApiTranslationRows({
    values,
    indexes,
    languages,
  });
  if (requestRows.length === 0) {
    showToast("Нет пустых ячеек для API-перевода");
    return;
  }

  const batchCount = Math.ceil(requestRows.length / config.batchSize);
  let writtenCount = 0;

  for (
    let offset = 0;
    offset < requestRows.length;
    offset += config.batchSize
  ) {
    const requestBatch = requestRows.slice(offset, offset + config.batchSize);
    const batchNumber = Math.floor(offset / config.batchSize) + 1;
    showToast(`API: пакет ${batchNumber}/${batchCount}`, "Локализация", 3);

    const response = config.dryRun
      ? createDryRunResponse(requestBatch)
      : callApiBatchWithRetry(config, {
          batch: requestBatch.map((item) => item.payload),
        });
    const normalized = validateApiBatchResponse(response, requestBatch);

    if (!config.dryRun) {
      writtenCount += writeApiBatchToSheet(
        sheet,
        normalized,
        requestBatch,
        config,
      );
    }
  }

  if (writtenCount > 0 && config.highlightClearMinutes > 0) {
    scheduleHighlightClear(sheet, config.highlightClearMinutes);
  }

  const elapsedMs = Date.now() - startedAt;
  const suffix = config.dryRun ? " (DRY RUN)" : "";
  showToast(
    `API: строк ${requestRows.length}, ячеек ${writtenCount}, пакетов ${batchCount}, ${elapsedMs} мс${suffix}`,
    "Готово",
    8,
  );
}

function buildApiTranslationRows({ values, indexes, languages }) {
  const rows = [];
  const seenLabels = new Set();

  for (
    let valueIndex = LOCALIZATION_CONFIG.headerRow;
    valueIndex < values.length;
    valueIndex++
  ) {
    const sheetRow = valueIndex + 1;
    const row = values[valueIndex];
    const label = safeString(row[indexes.label]);

    if (!label) continue;
    if (seenLabels.has(label)) {
      setRowNote(
        sheetRow,
        indexes.label + 1,
        `Duplicate label: "${label}". Must be unique.`,
      );
      throw new Error(`Duplicate label found: "${label}" (row ${sheetRow}).`);
    }
    seenLabels.add(label);

    const sourceText = safeString(row[indexes.source]);
    if (!sourceText) continue;

    const targets = languages
      .filter((language) => !safeString(row[language.columnIndex]))
      .map((language) => ({
        code: language.code,
        columnIndex: language.columnIndex,
      }));
    if (targets.length === 0) continue;

    rows.push({
      label,
      sheetRow,
      targets,
      payload: {
        label,
        description: safeString(row[indexes.description]),
        meta: parseLocalizationMeta(
          row[indexes.meta],
          sheetRow,
          indexes.meta + 1,
        ),
        [LOCALIZATION_CONFIG.sourceLanguage]: sourceText,
        languages: targets.map((target) => target.code),
      },
    });
  }

  return rows;
}

function parseLocalizationMeta(value, row, column) {
  const text = safeString(value);
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("meta must be a JSON object");
    }
    return parsed;
  } catch (_error) {
    setRowNote(row, column, "meta: invalid JSON object");
    throw new Error(`Row ${row}: meta must contain a valid JSON object.`);
  }
}

function createDryRunResponse(requestBatch) {
  return {
    data: requestBatch.map((item) => ({
      label: item.label,
      localization: Object.fromEntries(
        item.targets.map((target) => [
          target.code,
          {
            text: `[SIM:${target.code}] ${item.payload[LOCALIZATION_CONFIG.sourceLanguage]}`,
          },
        ]),
      ),
    })),
  };
}

function getApiConfig() {
  const properties = PropertiesService.getScriptProperties();

  return {
    apiUrl: properties.getProperty("API_URL") || API_DEFAULTS.API_URL,
    apiKey: properties.getProperty("API_KEY") || API_DEFAULTS.API_KEY,
    batchSize: readPositiveIntegerProperty(
      properties,
      "BATCH_SIZE",
      API_DEFAULTS.BATCH_SIZE,
    ),
    retryMax: readNonNegativeIntegerProperty(
      properties,
      "RETRY_MAX",
      API_DEFAULTS.RETRY_MAX,
    ),
    retryDelayMs: readNonNegativeIntegerProperty(
      properties,
      "RETRY_DELAY_MS",
      API_DEFAULTS.RETRY_DELAY_MS,
    ),
    highlightColor:
      properties.getProperty("HIGHLIGHT_COLOR") || API_DEFAULTS.HIGHLIGHT_COLOR,
    highlightClearMinutes: readNonNegativeIntegerProperty(
      properties,
      "HIGHLIGHT_CLEAR_MINUTES",
      API_DEFAULTS.HIGHLIGHT_CLEAR_MINUTES,
    ),
    dryRun: readBooleanProperty(properties, "DRY_RUN", API_DEFAULTS.DRY_RUN),
  };
}

function readPositiveIntegerProperty(properties, name, fallback) {
  const value = Number.parseInt(properties.getProperty(name) || fallback, 10);
  return Number.isFinite(value) && value > 0
    ? value
    : Number.parseInt(fallback, 10);
}

function readNonNegativeIntegerProperty(properties, name, fallback) {
  const value = Number.parseInt(properties.getProperty(name) || fallback, 10);
  return Number.isFinite(value) && value >= 0
    ? value
    : Number.parseInt(fallback, 10);
}

function readBooleanProperty(properties, name, fallback) {
  return (properties.getProperty(name) || fallback).toLowerCase() === "true";
}

function callApiBatch(config, payload) {
  const headers = {};
  if (config.apiKey) {
    headers.Authorization = config.apiKey.startsWith("Bearer ")
      ? config.apiKey
      : `Bearer ${config.apiKey}`;
  }

  const response = UrlFetchApp.fetch(config.apiUrl, {
    method: "post",
    muteHttpExceptions: true,
    contentType: "application/json",
    headers,
    payload: JSON.stringify(payload),
    followRedirects: true,
    validateHttpsCertificates: true,
    escaping: false,
  });
  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`API HTTP ${statusCode}: ${responseText.slice(0, 500)}`);
  }

  try {
    return JSON.parse(responseText);
  } catch (_error) {
    throw new Error("API returned a non-JSON response.");
  }
}

function callApiBatchWithRetry(config, payload) {
  let lastError;

  for (let attempt = 0; attempt <= config.retryMax; attempt++) {
    try {
      if (attempt > 0 && config.retryDelayMs > 0) {
        Utilities.sleep(
          Math.min(config.retryDelayMs * 2 ** (attempt - 1), 30000),
        );
      }
      return callApiBatch(config, payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("API retry failed.");
}

function validateApiBatchResponse(response, requestBatch) {
  if (
    !response ||
    typeof response !== "object" ||
    !Array.isArray(response.data)
  ) {
    throw new Error('Response object must contain a "data" array.');
  }

  const expectedByLabel = new Map(
    requestBatch.map((item) => [item.label, item]),
  );
  const responseByLabel = new Map();

  for (const item of response.data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Response data items must be objects.");
    }

    const label = safeString(item.label);
    if (!label) throw new Error("Response item is missing a label.");
    if (!expectedByLabel.has(label)) {
      throw new Error(`Response contains unexpected label "${label}".`);
    }
    if (responseByLabel.has(label)) {
      throw new Error(`Response contains duplicate label "${label}".`);
    }
    responseByLabel.set(label, item);
  }

  const normalized = [];

  for (const requestItem of requestBatch) {
    const responseItem = responseByLabel.get(requestItem.label);
    if (!responseItem) {
      setRowNote(
        requestItem.sheetRow,
        1,
        `API response is missing label "${requestItem.label}".`,
      );
      throw new Error(`API response is missing label "${requestItem.label}".`);
    }

    const localization = responseItem.localization;
    if (
      !localization ||
      typeof localization !== "object" ||
      Array.isArray(localization)
    ) {
      throw new Error(
        `label "${requestItem.label}": missing "localization" object.`,
      );
    }

    const requestedCodes = new Set(
      requestItem.targets.map((target) => target.code),
    );
    const unexpectedCodes = Object.keys(localization).filter(
      (code) => !requestedCodes.has(code),
    );
    if (unexpectedCodes.length > 0) {
      throw new Error(
        `label "${requestItem.label}": unexpected languages: ${unexpectedCodes.join(", ")}.`,
      );
    }

    const normalizedLocalization = {};
    const missingCodes = [];

    for (const code of requestedCodes) {
      const rawValue = localization[code];
      const text =
        rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
          ? safeString(rawValue.text)
          : safeString(rawValue);

      if (!text) {
        missingCodes.push(code);
      } else {
        normalizedLocalization[code] = text;
      }
    }

    if (missingCodes.length > 0) {
      setRowNote(
        requestItem.sheetRow,
        1,
        `API response is missing languages: ${missingCodes.join(", ")}.`,
      );
      throw new Error(
        `label "${requestItem.label}": missing translations for ${missingCodes.join(", ")}.`,
      );
    }

    normalized.push({
      label: requestItem.label,
      localization: normalizedLocalization,
    });
  }

  return normalized;
}

function writeApiBatchToSheet(sheet, normalizedItems, requestBatch, config) {
  const requestByLabel = new Map(
    requestBatch.map((item) => [item.label, item]),
  );
  const highlight = parseRgbColor(config.highlightColor);
  let writtenCount = 0;

  for (const item of normalizedItems) {
    const requestItem = requestByLabel.get(item.label);
    if (!requestItem) continue;

    for (const target of requestItem.targets) {
      const cell = sheet.getRange(requestItem.sheetRow, target.columnIndex + 1);
      if (safeString(cell.getValue())) continue;

      const translation = safeString(item.localization[target.code]);
      if (!translation) continue;

      cell.setValue(translation);
      if (highlight) {
        cell.setBackgroundRGB(highlight.red, highlight.green, highlight.blue);
      }
      writtenCount++;
    }
  }

  return writtenCount;
}

function parseRgbColor(value) {
  const components = String(value || "")
    .split(/[,;]/)
    .map((component) => Number.parseInt(component.trim(), 10));

  if (
    components.length !== 3 ||
    components.some(
      (component) =>
        !Number.isFinite(component) || component < 0 || component > 255,
    )
  ) {
    return null;
  }

  return {
    red: components[0],
    green: components[1],
    blue: components[2],
  };
}

function rgbColorToHex(color) {
  if (!color) return null;
  const toHex = (component) => component.toString(16).padStart(2, "0");
  return `#${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`.toLowerCase();
}

function scheduleHighlightClear(sheet, minutes) {
  const spreadsheet = sheet.getParent();
  PropertiesService.getScriptProperties().setProperty(
    HIGHLIGHT_CONTEXT_PROPERTY,
    JSON.stringify({
      spreadsheetId: spreadsheet.getId(),
      sheetId: sheet.getSheetId(),
    }),
  );

  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (
      trigger.getHandlerFunction() === "clearScheduledLocalizationHighlight"
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger("clearScheduledLocalizationHighlight")
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
}

function clearLocalizationHighlight() {
  assertTargetSpreadsheet();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet) throw new Error("No active sheet.");

  const clearedCount = clearLocalizationHighlightOnSheet(sheet);
  deleteScheduledHighlightClear();
  showToast(`Подсветка очищена: ${clearedCount}`);
}

function clearScheduledLocalizationHighlight() {
  const sheet = getScheduledHighlightTargetSheet();
  if (sheet) clearLocalizationHighlightOnSheet(sheet);
  deleteScheduledHighlightClear();
}

function clearLocalizationHighlightOnSheet(sheet) {
  const config = getApiConfig();
  const highlight = parseRgbColor(config.highlightColor);
  if (!highlight)
    throw new Error(
      "HIGHLIGHT_COLOR must contain three RGB values from 0 to 255.",
    );

  if (sheet.getLastRow() <= LOCALIZATION_CONFIG.headerRow) return 0;

  const headers = getSheetHeaders(sheet);
  const indexes = indexLocalizationHeader(headers);
  const languages = getLocalizationColumns(headers, indexes.source);
  const targetHex = rgbColorToHex(highlight);
  const rowCount = sheet.getLastRow() - LOCALIZATION_CONFIG.headerRow;
  let clearedCount = 0;

  for (const language of languages) {
    const range = sheet.getRange(
      LOCALIZATION_CONFIG.headerRow + 1,
      language.columnIndex + 1,
      rowCount,
      1,
    );
    const backgrounds = range.getBackgrounds();
    let changed = false;

    for (const row of backgrounds) {
      if (safeString(row[0]).toLowerCase() !== targetHex) continue;
      row[0] = null;
      changed = true;
      clearedCount++;
    }

    if (changed) range.setBackgrounds(backgrounds);
  }

  return clearedCount;
}

function getScheduledHighlightTargetSheet() {
  const properties = PropertiesService.getScriptProperties();
  const rawContext = properties.getProperty(HIGHLIGHT_CONTEXT_PROPERTY);
  if (!rawContext) return null;

  try {
    const context = JSON.parse(rawContext);
    const spreadsheet = SpreadsheetApp.openById(context.spreadsheetId);
    assertTargetSpreadsheet(spreadsheet);
    return spreadsheet.getSheetById(context.sheetId);
  } catch (_error) {
    properties.deleteProperty(HIGHLIGHT_CONTEXT_PROPERTY);
    throw new Error(
      "Cannot resolve the sheet used for localization highlighting.",
    );
  }
}

function deleteScheduledHighlightClear() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (
      trigger.getHandlerFunction() === "clearScheduledLocalizationHighlight"
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  PropertiesService.getScriptProperties().deleteProperty(
    HIGHLIGHT_CONTEXT_PROPERTY,
  );
}
