.DEFAULT_GOAL := help

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

TAG_PATTERN := ^v[0-9]+\.[0-9]+\.[0-9]+$$

.PHONY: help tag-add tag-remove

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Available commands:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

tag-add: ## Validate, create, and push a tag for all projects. E.g. make tag-add TAG=v0.0.1
	@if [[ -z "$(TAG)" ]]; then echo "TAG is not set. Use TAG=vX.Y.Z."; exit 1; fi
	@if [[ ! "$(TAG)" =~ $(TAG_PATTERN) ]]; then echo "TAG must use vX.Y.Z format."; exit 1; fi
	@node tool/resolve-release.mjs "$(TAG)" >/dev/null
	@if [[ "$$(git branch --show-current)" != "main" ]]; then echo "Production tags must be created from main."; exit 1; fi
	@if [[ -n "$$(git status --porcelain)" ]]; then echo "Working tree must be clean before creating a tag."; exit 1; fi
	@git fetch origin main --tags
	@if [[ "$$(git rev-parse HEAD)" != "$$(git rev-parse origin/main)" ]]; then echo "Local main must match origin/main."; exit 1; fi
	@if git rev-parse --quiet --verify "refs/tags/$(TAG)" >/dev/null; then echo "Tag $(TAG) already exists locally."; exit 1; fi
	@if git ls-remote --exit-code --tags origin "refs/tags/$(TAG)" >/dev/null 2>&1; then echo "Tag $(TAG) already exists on origin."; exit 1; fi
	@npm run check
	@git tag --annotate "$(TAG)" --message "release: deploy all localization Apps Script projects $(TAG)"
	@git push origin "$(TAG)"
	@echo "Created and pushed $(TAG). Production deployment has started for every registered project."

tag-remove: ## Delete a global project tag locally and from origin. E.g. make tag-remove TAG=v0.0.1
	@if [[ -z "$(TAG)" ]]; then echo "TAG is not set. Use TAG=vX.Y.Z."; exit 1; fi
	@if [[ ! "$(TAG)" =~ $(TAG_PATTERN) ]]; then echo "TAG must use vX.Y.Z format."; exit 1; fi
	@echo "WARNING: deleting a tag does not cancel or roll back an Apps Script deployment."
	@printf 'Type %s to delete it locally and from origin: ' "$(TAG)"; read -r confirmation; if [[ "$$confirmation" != "$(TAG)" ]]; then echo "Tag deletion cancelled."; exit 1; fi
	@if git rev-parse --quiet --verify "refs/tags/$(TAG)" >/dev/null; then git tag --delete "$(TAG)"; else echo "Tag $(TAG) does not exist locally."; fi
	@if git ls-remote --exit-code --tags origin "refs/tags/$(TAG)" >/dev/null 2>&1; then git push origin --delete "$(TAG)"; else echo "Tag $(TAG) does not exist on origin."; fi
	@echo "Deleted $(TAG) locally and from origin. Do not reuse this version."
