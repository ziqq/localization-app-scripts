# Changelog

All notable changes to the localization Apps Script are documented in this file.

## Unreleased

## 0.0.1 - 25/09/2026

- **ADDED**: One global `vX.Y.Z` release deploys the same source version to every project registered in `projects.json`.
- **ADDED**: Project-specific GitHub Environments provide `APPS_SCRIPT_ID`, `SPREADSHEET_ID`, `SPREADSHEET_TITLE`, and
  `CLASPRC_JSON`, so the public repository contains no deployment target or OAuth credential.
- **ADDED**: Every menu command and direct mutation checks that the bound spreadsheet matches the generated deployment target.
- **ADDED**: Safe localization-sheet creation and template synchronization for locale columns, formatting, validation, and
  conditional-format rules.
- **ADDED**: Native Google translation with rate-limit retries, `GOOGLETRANSLATE` formula management, and the optional
  validated batch API workflow.
- **ADDED**: Pull requests to `main` run formatting, lint, and Node tests without production credentials.
- **CHANGED**: `TRANSLATE_RU_ONLY` keeps spaces as separate fragments and trims Cyrillic parts before translation.
- **CHANGED**: Production deployment runs only from a reviewed `main` commit tagged with a stable `vX.Y.Z` release tag.
