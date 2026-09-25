import { chmodSync, writeFileSync } from "node:fs";

import { createClaspConfig, createTargetSource } from "./project-registry.mjs";

const claspConfigUrl = new URL("../.clasp.json", import.meta.url);
const targetSourceUrl = new URL("../src/target.generated.js", import.meta.url);

try {
  const config = createClaspConfig(process.env.APPS_SCRIPT_ID);
  const targetSource = createTargetSource(
    process.env.SPREADSHEET_ID,
    process.env.SPREADSHEET_TITLE,
  );

  writeFileSync(claspConfigUrl, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
  chmodSync(claspConfigUrl, 0o600);
  writeFileSync(targetSourceUrl, targetSource, { mode: 0o600 });
  chmodSync(targetSourceUrl, 0o600);
  process.stdout.write("Configured the selected Apps Script target.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}
