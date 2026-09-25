import { appendFileSync } from "node:fs";

import {
  createDeploymentMatrix,
  validateReleaseTag,
} from "./project-registry.mjs";

const [tag, outputPath] = process.argv.slice(2);

try {
  const releaseTag = validateReleaseTag(tag);
  const matrix = createDeploymentMatrix();

  if (outputPath) {
    appendFileSync(
      outputPath,
      ["matrix=" + JSON.stringify(matrix), ""].join("\n"),
    );
  } else {
    process.stdout.write(JSON.stringify({ tag: releaseTag, matrix }) + "\n");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message + "\n");
  process.exitCode = 1;
}
