import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

/** Deployment target injected in place of the generated `target.generated.js`. */
export const TEST_TARGET_SPREADSHEET = Object.freeze({
  id: "test_spreadsheet_id_1234567890",
  title: "test_localization",
});

/** Creates a spreadsheet stub that passes the deployment target guard. */
export function createTargetSpreadsheet(members = {}) {
  return {
    getId: () => TEST_TARGET_SPREADSHEET.id,
    getName: () => TEST_TARGET_SPREADSHEET.title,
    ...members,
  };
}

export function loadAppsScript(files, globals = {}) {
  const context = vm.createContext({
    console,
    TARGET_SPREADSHEET: TEST_TARGET_SPREADSHEET,
    ...globals,
  });

  for (const file of files) {
    const path = `${projectRoot}/src/${file}`;
    const source = readFileSync(path, "utf8");
    vm.runInContext(source, context, { filename: path });
  }

  return context;
}
