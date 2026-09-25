import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);

test("Apps Script source avoids unsupported numeric separators", () => {
  const sourceFiles = readdirSync(sourceRoot).filter((name) =>
    name.endsWith(".js"),
  );

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(new URL(sourceFile, sourceRoot), "utf8");

    assert.doesNotMatch(
      source,
      /\b\d[\d_]*_\d[\d_]*\b/,
      sourceFile + " contains a numeric separator unsupported by Apps Script.",
    );
  }
});
