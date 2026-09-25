import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

function readRepositoryFile(path) {
  return readFileSync(new URL(path, repositoryRoot), "utf8");
}

test("one protected semver tag deploys every registered project", () => {
  const packageJson = JSON.parse(readRepositoryFile("package.json"));
  const workflow = readRepositoryFile(
    ".github/workflows/deploy-apps-script.yml",
  );

  assert.equal(packageJson.scripts.push, undefined);
  assert.match(workflow, /tags:\s*\n\s*- ["']v\*["']/);
  assert.match(workflow, /origin\/main/);
  assert.match(workflow, /node tool\/resolve-release\.mjs/);
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.release\.outputs\.matrix\) \}\}/,
  );
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /environment: \$\{\{ matrix\.environment \}\}/);
  assert.match(workflow, /APPS_SCRIPT_ID: \$\{\{ secrets\.APPS_SCRIPT_ID \}\}/);
  assert.match(workflow, /SPREADSHEET_ID: \$\{\{ secrets\.SPREADSHEET_ID \}\}/);
  assert.match(
    workflow,
    /SPREADSHEET_TITLE: \$\{\{ vars\.SPREADSHEET_TITLE \}\}/,
  );
  assert.match(workflow, /clasp --auth .* push --force/);
});

test("pull requests to main run repository checks without production access", () => {
  const workflow = readRepositoryFile(
    ".github/workflows/pull-request-checks.yml",
  );

  assert.match(workflow, /pull_request:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /name: Repository checks/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run check/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /clasp .* push/);
});

test("OAuth credentials remain outside Git", () => {
  const gitignore = readRepositoryFile(".gitignore");
  const workflow = readRepositoryFile(
    ".github/workflows/deploy-apps-script.yml",
  );

  assert.match(gitignore, /^\.clasprc\*\.json$/m);
  assert.match(gitignore, /^\.clasp\.json$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(workflow, /\$\{\{ secrets\.CLASPRC_JSON \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.APPS_SCRIPT_ID \}\}/);
  assert.doesNotMatch(workflow, /["']refresh_token["']\s*:/);
});

test("public repository tracks no production identifiers or backups", () => {
  const trackedFiles = execFileSync("git", ["ls-files"], {
    cwd: fileURLToPath(repositoryRoot),
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  assert.match(
    readRepositoryFile(".gitignore"),
    /^src\/target\.generated\.js$/m,
  );
  assert.deepEqual(
    trackedFiles.filter(
      (path) =>
        path.startsWith("backup/") ||
        path.endsWith(".gs") ||
        path === "src/target.generated.js",
    ),
    [],
  );

  for (const path of trackedFiles.filter((file) =>
    /\.(js|mjs|json|md|yml)$/.test(file),
  )) {
    assert.doesNotMatch(
      readRepositoryFile(path),
      /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}|script\.google\.com\/.*projects\/[A-Za-z0-9_-]{20,}/,
      path + " references a live spreadsheet or Apps Script project.",
    );
  }
});

test("release metadata declares the 0.0.1 release", () => {
  const packageJson = JSON.parse(readRepositoryFile("package.json"));
  const packageLock = JSON.parse(readRepositoryFile("package-lock.json"));
  const changelog = readRepositoryFile("CHANGELOG.md");

  assert.equal(packageJson.version, "0.0.1");
  assert.equal(packageLock.version, "0.0.1");
  assert.equal(packageLock.packages[""].version, "0.0.1");
  assert.match(changelog, /^## 0\.0\.1 - \d{2}\/\d{2}\/\d{4}$/m);
});

test("Make release targets preserve the protected tag workflow", () => {
  const makefile = readRepositoryFile("Makefile");

  assert.match(makefile, /^tag-add:.*TAG=v0\.0\.1$/m);
  assert.match(
    makefile,
    /TAG_PATTERN := \^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$\$/,
  );
  assert.match(makefile, /Production tags must be created from main/);
  assert.match(makefile, /Working tree must be clean before creating a tag/);
  assert.match(makefile, /Local main must match origin\/main/);
  assert.match(makefile, /node tool\/resolve-release\.mjs/);
  assert.match(makefile, /npm run check/);
  assert.match(makefile, /git tag --annotate/);
  assert.match(makefile, /git push origin "\$\(TAG\)"/);
  assert.match(makefile, /every registered project/);

  assert.match(makefile, /^tag-remove:.*TAG=v0\.0\.1$/m);
  assert.match(makefile, /deleting a tag does not cancel or roll back/);
  assert.match(makefile, /read -r confirmation/);
  assert.match(makefile, /git push origin --delete/);
});

test("clasp uploads only src", () => {
  const claspConfig = JSON.parse(readRepositoryFile(".clasp.example.json"));

  assert.equal(claspConfig.rootDir, "src");
  assert.equal(claspConfig.scriptId, "YOUR_APPS_SCRIPT_ID");
});
