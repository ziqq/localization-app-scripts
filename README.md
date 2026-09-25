# localization-app-scripts

Container-bound Google Apps Script for localization spreadsheets consumed by
[sheety-localization](https://github.com/ziqq/sheety-localization).

This repository is the source of truth for every registered Apps Script project. Production changes only when a reviewed
commit from `main` is released with a `vX.Y.Z` Git tag. Do not run `clasp push` manually.

One release tag deploys the same source version to every project registered in `projects.json`. There is no project selector,
exclusion list, or per-project release mode.

## Public repository boundary

This repository is public. It must never contain:

- Apps Script IDs, spreadsheet IDs, or links to live spreadsheets and script projects;
- OAuth credentials (`.clasprc*.json`, refresh or access tokens), API keys, or service-account files;
- backups of production source or spreadsheet data.

Deployment targets live only in GitHub Environments. `npm run project:configure` writes the ignored `.clasp.json` and
`src/target.generated.js` from environment values inside each deployment job. Production backups are kept in private
storage owned by each consuming project.

## Features

- creates a new localization sheet as a complete copy of `template`;
- synchronizes missing locale columns, formatting, data validation, and conditional formatting from `template`;
- applies bulk synchronization only to sheets with the localization schema;
- sorts the active localization sheet by a configured column;
- fills empty translations through `LanguageApp` while preserving placeholders, line breaks, and ICU plural blocks, with
  pauses between requests and exponential backoff on rate limits;
- fills, freezes, and clears `GOOGLETRANSLATE` formulas;
- optionally translates empty cells through a batch HTTP API with retries, dry-run mode, validation, and highlighting;
- keeps the `TRANSLATE_RU_ONLY` custom spreadsheet function;
- refuses every command when the bound spreadsheet does not match the generated deployment target.

## Sheet contract

The first row is the header. Domain sheets and `template` use this structure:

```text
label | description | meta | ru | en | kk | be | ...
```

- `label` must be unique among non-empty rows.
- `description` provides translation context.
- `meta` is empty or contains valid JSON, including placeholder metadata.
- `ru` is the source locale.
- language columns after `ru` use BCP-47-like codes such as `en`, `kk`, `be`, or `pt_BR`.
- translation commands fill only empty target cells and do not overwrite existing translations.

`template` and `locales` are metadata sheets. Bulk synchronization discovers target sheets automatically, but only when their
header contains `label`, `description`, `meta`, and `ru`. Blank, temporary, and unrelated sheets are ignored.

## How to use the spreadsheet

Reload the spreadsheet after a production deployment. The `Локализация` menu appears when `onOpen` runs.

### Create a domain sheet

1. Open `Локализация` → `Создать лист из template`.
2. Enter a unique sheet name.
3. The command copies the entire `template` sheet, including values, formulas, formatting, validation, dimensions, and
   conditional-format rules.
4. Add localization rows to the new sheet. Do not create domain sheets as blank sheets, because bulk synchronization
   intentionally ignores sheets without the localization schema.

### Add a locale

1. Add and configure the new language column on `template`.
2. Run `Добавить новые локали из template` to add missing columns to existing localization sheets.
3. Run `Синхронизировать условное форматирование` if only formatting rules need to be refreshed, or
   `Синхронизировать всё из template` to do both operations.

### Menu command reference

| Menu command                                     | Scope                   | Effect and caution                                                                                                                                           |
| ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Создать лист из template`                       | New sheet               | Creates a complete copy of `template`; rejects empty, reserved, invalid, or duplicate names.                                                                 |
| `Перевести пустые ячейки через API`              | Active sheet            | Sends source text plus localization context to `API_URL` and writes validated translations into empty cells. Fails without `API_URL`, unless `DRY_RUN=true`. |
| `Перевести пустые ячейки через Google Translate` | Active sheet            | Uses Google `LanguageApp` for all target locale columns and writes only empty cells.                                                                         |
| `Заполнить формулы GOOGLETRANSLATE`              | Active sheet            | Inserts `GOOGLETRANSLATE` formulas into empty target cells. Existing values are preserved.                                                                   |
| `Зафиксировать формулы GOOGLETRANSLATE`          | Active sheet            | Replaces `GOOGLETRANSLATE` formulas with their current displayed values. This cannot be undone by the script.                                                |
| `Удалить формулы GOOGLETRANSLATE`                | Active sheet            | Clears cells that still contain `GOOGLETRANSLATE` formulas; ordinary values are preserved.                                                                   |
| `Добавить новые локали из template`              | All localization sheets | Adds missing template columns and copies their format and validation. Unrelated sheets are ignored.                                                          |
| `Синхронизировать условное форматирование`       | All localization sheets | Replaces conditional-format rules with rules mapped from `template`.                                                                                         |
| `Синхронизировать всё из template`               | All localization sheets | Runs both column synchronization and conditional-format synchronization.                                                                                     |
| `Сортировать текущий лист`                       | Active sheet            | Sorts data rows by the configured column and then by `label`; the header is preserved.                                                                       |
| `Очистить подсветку переводов`                   | Active sheet            | Clears only the background color configured by `HIGHLIGHT_COLOR` and removes the scheduled highlight-clear trigger.                                          |

## Local setup

Requirements: Node.js 20+ and a Google account with access to the spreadsheet and its bound Apps Script project.

```sh
npm ci
npm run check
```

Local `clasp` commands additionally need an ignored target configuration:

```sh
APPS_SCRIPT_ID=... SPREADSHEET_ID=... SPREADSHEET_TITLE=... npm run project:configure
npm run login
npm run status
```

If login reports that the Apps Script API is disabled, enable it in the Google Apps Script user settings and retry.

## Commands

| Command                      | What it does                                                                                                                                       | Mutates production?                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `npm ci`                     | Installs the exact dependency tree from `package-lock.json`.                                                                                       | No                                          |
| `npm run login`              | Starts Google OAuth for `clasp` and stores credentials in the user-level `.clasprc.json`. Never commit that file or its contents.                  | No                                          |
| `npm run project:configure`  | Writes the ignored `.clasp.json` and `src/target.generated.js` from `APPS_SCRIPT_ID`, `SPREADSHEET_ID`, and `SPREADSHEET_TITLE`.                   | No, but mutates local configuration         |
| `npm run status`             | Lists the files under `src/` that `clasp` would upload. It is a read-only preflight check.                                                         | No                                          |
| `npm run open`               | Opens the bound Apps Script project in the browser. Direct online edits will drift from Git.                                                       | No                                          |
| `npm run pull`               | Downloads the online project into `src/`. It can overwrite local source; run it only on a clean branch.                                            | No, but mutates local files                 |
| `npm run format`             | Rewrites supported repository files with Prettier.                                                                                                 | No                                          |
| `npm run format:check`       | Checks formatting without rewriting files.                                                                                                         | No                                          |
| `npm run lint`               | Runs ESLint against the repository source and tests.                                                                                               | No                                          |
| `npm test`                   | Runs the Node unit tests for Apps Script helpers, translation, sheet discovery, template copying, and deployment policy.                           | No                                          |
| `npm run check`              | Runs formatting check, lint, and unit tests without a production target or OAuth credentials.                                                      | No                                          |
| `make help`                  | Lists the available Make targets.                                                                                                                  | No                                          |
| `make tag-add TAG=vX.Y.Z`    | Validates a clean, synchronized `main`, runs the release preflight, creates an annotated tag, and deploys every registered project.                | Yes; starts all production deployments      |
| `make tag-remove TAG=vX.Y.Z` | After an interactive confirmation, deletes the tag locally and from `origin`. It cannot cancel or roll back a deployment that has already started. | Does not roll back Apps Script; deletes Git |

There is deliberately no `npm run push` command.

## Pull request checks

Every pull request targeting `main` runs [`.github/workflows/pull-request-checks.yml`](.github/workflows/pull-request-checks.yml).
It installs the locked dependency tree and runs `npm run check`. It has read-only repository permissions, receives no
production environment, and cannot access deployment secrets or run `clasp push`.

## Production deployment: tags only

The workflow [`.github/workflows/deploy-apps-script.yml`](.github/workflows/deploy-apps-script.yml) is the only supported
production deployment path. It:

1. accepts only tags matching `vX.Y.Z`, for example `v0.0.1`;
2. rejects a tagged commit that is not reachable from `origin/main`;
3. resolves every entry from `projects.json` into a deployment matrix;
4. runs `npm run check` once before any project deployment starts;
5. starts one deployment job per registered project with `fail-fast: false`;
6. selects that project's GitHub Environment, generates the ignored target files, validates them, authenticates from
   `CLASPRC_JSON`, and runs `clasp push --force`.

Apps Script has no atomic cross-project transaction, so a failed matrix job can leave projects temporarily on different
versions. Fix or roll back with a new higher tag. Never move or reuse a tag.

## Project registry

`projects.json` is the complete list of deployment targets. It contains only routing metadata:

```json
{
  "projects": [
    {
      "slug": "cardhub",
      "environment": "apps-script-cardhub-production"
    }
  ]
}
```

Each listed GitHub Environment must define:

| Name                | Kind     | Purpose                                                                              |
| ------------------- | -------- | ------------------------------------------------------------------------------------ |
| `APPS_SCRIPT_ID`    | Secret   | The container-bound Apps Script project updated by this matrix job.                  |
| `SPREADSHEET_ID`    | Secret   | The spreadsheet the script is allowed to operate on.                                 |
| `CLASPRC_JSON`      | Secret   | The complete clasp OAuth JSON for a release account with edit access to that script. |
| `SPREADSHEET_TITLE` | Variable | The expected spreadsheet title, checked together with the ID.                        |

To add a project:

1. Create or identify its container-bound Apps Script project and capture a private backup of its current source.
2. Add a unique lowercase slug and unique `apps-script-*-production` environment name to `projects.json`.
3. Create the matching GitHub Environment, restrict deployments to `v*` tags, and configure the values above.
4. Merge the registry change before creating the next release tag.

## Script properties

The native Google Translate commands work without script properties. Batch API translation requires:

| Property                  | Required | Default       | Purpose                                                     |
| ------------------------- | -------- | ------------- | ----------------------------------------------------------- |
| `API_URL`                 | yes      | empty         | HTTPS endpoint accepting `{ "batch": [...] }`               |
| `API_KEY`                 | no       | empty         | Bearer token for the endpoint                               |
| `BATCH_SIZE`              | no       | `3`           | Rows sent per request                                       |
| `RETRY_MAX`               | no       | `2`           | Retries after a failed request                              |
| `RETRY_DELAY_MS`          | no       | `1000`        | Initial exponential-backoff delay                           |
| `HIGHLIGHT_COLOR`         | no       | `220,255,220` | RGB background for newly written translations               |
| `HIGHLIGHT_CLEAR_MINUTES` | no       | `1`           | Automatic highlight clearing; `0` disables it               |
| `DRY_RUN`                 | no       | `false`       | Validates and simulates API responses without writing cells |

Configure properties in Apps Script → Project Settings → Script Properties. Never commit API keys.

Because the API client is part of the uploaded source, Google authorization includes external HTTP requests, trigger
management, script properties, and spreadsheet access even if the API command is never used. Localization text leaves Google
only when a user explicitly runs the API translation command with a configured `API_URL`.

## License

[MIT](LICENSE)
