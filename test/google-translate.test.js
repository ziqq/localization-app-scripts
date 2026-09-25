import assert from "node:assert/strict";
import test from "node:test";

import { loadAppsScript } from "../test-support/load-apps-script.js";

function createScript(translate = (text) => text, sleeps = []) {
  return loadAppsScript(["config.js", "google-translate.js"], {
    LanguageApp: { translate },
    Utilities: { sleep: (ms) => sleeps.push(ms) },
  });
}

test("placeholder values survive LanguageApp translation", () => {
  const script = createScript((text, _source, target) => `[${target}] ${text}`);

  const result = script.translateTextWithPlaceholders(
    "Привет, {name}!",
    "ru",
    "en",
  );

  assert.equal(result, "[en] Привет, {name}!");
});

test("missing protection marker is rejected", () => {
  const script = createScript(() => "translated without marker");

  assert.throws(
    () => script.translateTextWithPlaceholders("Привет, {name}!", "ru", "en"),
    /Google Translate удалил служебный маркер/,
  );
});

test("ICU plural parser keeps nested braces inside one block", () => {
  const script = createScript();
  const text =
    "Найдено {count, plural, one {одно для {name}} other {# записей}} сегодня";

  const blocks = script.findIcuPluralBlocks(text);

  assert.equal(blocks.length, 1);
  assert.equal(
    blocks[0].value,
    "{count, plural, one {одно для {name}} other {# записей}}",
  );
});

test("unclosed ICU plural block is rejected", () => {
  const script = createScript();

  assert.throws(
    () => script.findIcuPluralBlocks("{count, plural, one {Одна запись}"),
    /Незакрытая ICU plural-конструкция/,
  );
});

test("TRANSLATE_RU_ONLY sends only Cyrillic fragments to LanguageApp", () => {
  const calls = [];
  const script = createScript((text) => {
    calls.push(text);
    return `translated(${text})`;
  });

  const result = script.TRANSLATE_RU_ONLY("Cardhub: Привет!", "ru", "en");

  assert.equal(result, "Cardhub: translated(Привет!)");
  assert.deepEqual(calls, ["Привет!"]);
});

test("rate-limited translation retries with exponential backoff", () => {
  const sleeps = [];
  let attempts = 0;
  const script = createScript((text) => {
    attempts++;
    if (attempts < 3) {
      throw new Error("Service invoked too many times for one day");
    }
    return `ok(${text})`;
  }, sleeps);

  assert.equal(script.translateWithRetry("Привет", "ru", "en"), "ok(Привет)");
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [1000, 2000, 250]);
});

test("rate-limited translation fails after the configured attempts", () => {
  const sleeps = [];
  const script = createScript(() => {
    throw new Error("Слишком много раз за короткий период времени");
  }, sleeps);

  assert.throws(
    () => script.translateWithRetry("Привет", "ru", "en"),
    /Количество попыток: 5/,
  );
  assert.deepEqual(sleeps, [1000, 2000, 4000, 8000]);
});

test("non rate-limit translation errors are not retried", () => {
  let attempts = 0;
  const script = createScript(() => {
    attempts++;
    throw new Error("Invalid argument: target");
  });

  assert.throws(
    () => script.translateWithRetry("Привет", "ru", "xx"),
    /Invalid argument/,
  );
  assert.equal(attempts, 1);
});

test("blank text is returned without calling LanguageApp", () => {
  const script = createScript(() => {
    throw new Error("must not be called");
  });

  assert.equal(script.translateWithRetry("  ", "ru", "en"), "  ");
});
