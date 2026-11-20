---
name: lint-as-if-perfect
description: Checks selected files with ESLint language recommended, typescript-eslint strict, YAML/TOML recommended, and Unicorn recommended presets, and supports agent-reviewed repairs without changing project configuration. Applies when users or agents request linting, best-practice checks or repairs on JavaScript, TypeScript, JSX, TSX, Vue, CSS, HTML, JSON, Markdown, TOML, or YAML files, or identification and repair of newly introduced lint findings against Git or pre-edit snapshots.
---

# Lint As If Perfect

Run [scripts/lint.mjs](scripts/lint.mjs) to check and repair the requested files. Checks use ESLint recommended for JavaScript/JSX, ESLint recommended plus typescript-eslint strict for TypeScript/TSX and Vue scripts, the CSS/JSON/Markdown and YAML/TOML plugins' recommended presets, and Unicorn recommended presets for every supported language. [assets/eslint.config.mjs](assets/eslint.config.mjs) defines the active configuration and shared exceptions. TypeScript remains parsing-only: no project type service or type-aware rules are enabled. Standard browser and Node globals are accepted because project configuration is not loaded; project-specific globals may need agent review. Checks are read-only; `--fix` without `--dry-run` writes ESLint automatic fixes to selected source files. The Git index and project configuration remain unchanged. Existing project ESLint configuration and inline ESLint directives do not affect this audit.

## Requirements

- Node 24.4+ and npm. Put pnpm on `PATH` to prefer it for dependency installation; npm is the fallback when pnpm is unavailable.
- Git for `--base` and `--changed`.
- The entry point automatically prepares dependencies and matching Unicorn documentation outside the project. Normal runs require registry access and may update dependency versions. `--no-install` reuses prepared versions without network access; missing or invalid dependencies or documentation are setup errors. Prepare once and use `--no-install` throughout a repair/recheck sequence to keep dependency versions unchanged.

## Workflow

1. Identify the requested files and comparison scope. Read applicable repository instructions. Keep the check within that scope.
2. Choose a baseline when attribution is requested:
   - `--base HEAD`: compare current on-disk content, including staged and unstaged changes, with the last commit.
   - `--base REF`: compare with a specified commit. For a branch comparison, resolve the merge base with the requested target branch and pass that commit.
   - Before agent edits, use `--snapshot DIR` to preserve the selected files, including existing uncommitted content. After edits, use `--baseline DIR` with that snapshot.
   - Without a baseline, report all findings with unknown attribution. Do not attribute all Git changes to the agent.
3. Invoke the script by its absolute path, set `--cwd` to the project directory, and pass files, globs, or directories after `--`. Quote globs and batch related files in one call.
4. Read the output and exit status. Report `new` and `unknown` findings first; summarize `existing` separately. Include file locations, rule IDs, messages, and attribution evidence. Inspect `baselineErrors` when comparison fails.
5. Evaluate findings and complete worthwhile repairs within the requested scope using the repair workflow below. If the user explicitly requests inspection or reporting only, do not edit files. When repairs are requested, act on justified improvements and explain intentionally retained findings.

## Repair workflow

1. Check first. The agent must independently decide whether each in-scope finding is worth fixing, weighing actual correctness, safety, maintainability, project conventions, behavior/API compatibility, and the cost and risk of the change. Rule severity, preset membership, or an available autofix does not by itself justify a repair. Retain valid intentional patterns, false positives, and low-value preference changes with a concrete reason; do not aim to eliminate every diagnostic. Preserve the original baseline through all repair and recheck steps. In an incremental task, assess `new` findings first, review `unknown` before editing, and leave `existing` findings untouched unless included in the request.
2. Prefer ESLint automatic fixes. Run `--fix --dry-run --format json` to inspect the proposed changes, then use `--fix` only when every proposed automatic change in those selected files is both worthwhile and within scope. `--fix` applies all automatic fixes in each selected file, including historical findings; it does not filter by attribution. For new-only repairs in files with historical issues, use the preview and apply only the authorized automatic changes instead of running unrestricted `--fix`. Automatic fix ranges can overlap; do not splice every reported fix into a file. Apply one reviewed edit to current content and recheck, or use ESLint to manage compatible fixes.
3. For a worthwhile suggestion or manual repair, read the finding's `documentationPath` when present; it contains rule documentation matching the installed Unicorn version. For findings without a local documentation path, consult the finding's `documentationUrl` when needed. Inspect remaining `files[].messages[].suggestions`. JSON preserves each suggestion's description and replacement range/text; text output lists available suggestions and edits. Choose a suggestion compatible with the project's behavior and runtime targets. Suggestions can be alternatives: never apply all choices blindly. Use the current file content, apply one chosen edit, and recheck before using another range. Ranges are UTF-16 string offsets; preview ranges refer to the proposed `output`, not the original file.
4. For findings selected for repair, if neither automatic fixes nor suitable suggestions are available, make the smallest behavior-preserving manual repair. Do not disable rules or rewrite unrelated code to obtain a clean report. Leave incompatible recommendations unresolved with a concrete reason.
5. Recheck the actual files without fix-preview mode, against the same baseline, and run relevant project tests. Continue until worthwhile in-scope repairs are verified and every retained finding has a concrete reason or blocker. Report changed files, verification results, and intentionally retained or unresolved findings; a nonzero lint exit can remain without making a justified repair incomplete. A clean preview alone is not a completed repair.

## Commands

Set `SKILL_DIR` to this skill's absolute directory and `PROJECT` to the project directory. Set `SNAPSHOT_DIR` to a new directory outside the checked source tree; its parent must exist.

```sh
# Check selected files without a baseline.
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --format json -- src/util.ts src/App.vue

# Compare selected files with HEAD.
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --base HEAD --format json -- src/util.ts

# Check supported changed files, including untracked files, within --cwd.
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --base HEAD --changed --format json

# Capture selected files before editing, then compare after editing.
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --snapshot "$SNAPSHOT_DIR" -- src/util.ts
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --baseline "$SNAPSHOT_DIR" --format json -- src/util.ts

# Preview automatic fixes without writing, then apply in-scope file-wide fixes.
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --fix --dry-run --format json -- src/util.ts
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --fix --format json -- src/util.ts

# Recheck actual files after automatic or suggestion-based repairs.
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --format json -- src/util.ts

# Check a quoted glob using already installed dependencies.
node "$SKILL_DIR/scripts/lint.mjs" --cwd "$PROJECT" --no-install --format json -- 'src/**/*.ts'
```

Additional options:

- `--fix`: apply file-wide ESLint automatic fixes and report remaining findings.
- `--dry-run`: combine with `--fix` to preview automatic fixes without writing; JSON includes each changed file's proposed `output`.
- `--format text|json`: text is the default; use JSON for structured results, suggestions, and attribution evidence.
- `--no-cache`: reevaluate files when external context affecting a rule has changed.
- `--concurrency off|auto|N`: defaults to `off`; optionally enable workers for large batches.
- `--help`: show the complete CLI usage.
- `UNICORN_LINT_CACHE`: override the dependency and result cache directory.

Use only one of `--base`, `--baseline`, or `--snapshot`. `--dry-run` requires `--fix`; use `--fix --dry-run` for a preview and `--fix` alone to save changes. Snapshot creation cannot be combined with fix options. Fixes are blocked if current or baseline files have parsing errors. `--changed` requires `--base`; when combined with input paths, it checks only their changed subset. Git comparisons require files inside that repository. Snapshot comparisons require files under the original `--cwd`, with unchanged skill configuration.

## Supported files

- JavaScript: `.js`, `.cjs`, `.mjs`, `.jsx`, `.cjsx`, `.mjsx`.
- TypeScript: `.ts`, `.cts`, `.mts`, `.tsx`, `.ctsx`, `.mtsx`, including `.d.ts`, `.d.cts`, `.d.mts`. This check does not perform type checking.
- Vue: `.vue`; JavaScript/TypeScript in `<script>` and `<script setup>`. Vue-template expressions and style blocks are not included. Select external script `src` files separately.
- CSS: `.css`; HTML: `.html`.
- JSON: `.json`, `.jsonc`, `.json5`, each with its own dialect.
- Markdown: `.md`, using GFM. Fenced code and YAML frontmatter are not checked as separate files.
- TOML: `.toml`; YAML: `.yaml`, `.yml`.

SOML is unsupported. Directory and glob selection exclude `node_modules` and `.git`. An explicitly supplied unsupported file or unmatched input is an error.

## Results and attribution

- `existing`: the finding matches unchanged baseline source at the corresponding location.
- `new`: the finding is new relative to the chosen baseline. This does not prove behavioral causality or authorship.
- `unknown`: no baseline is available for the file, comparison is ambiguous after edits or moves, or a parsing/configuration failure prevents attribution. Keep these findings visible.

The output's `versions` lists the actual installed dependencies. The `repair` output reports applied/previewed files, remaining automatic fixes, suggestion count, and whether parsing errors blocked repair. Use `repair.documentationPath` for the Unicorn overview and a Unicorn message's `documentationPath` for its rule; these are absolute local paths ready to read. Messages retain ESLint `fix` and `suggestions` when available and include a rule `documentationUrl`; only Unicorn findings have a local `documentationPath`. Results in fix modes describe the code after automatic fixes; preview results do not describe the file currently on disk.

Exit statuses:

- `0`: no findings without a baseline, or no new/unknown findings with a baseline. Historical findings can still be present.
- `1`: findings without a baseline, or new/unknown findings with a baseline.
- `2`: setup, file selection, configuration, or current/baseline parsing failure. Do not report this as a successful check.

Snapshots preserve only selected files and never overwrite an existing snapshot directory. A file absent from a snapshot has unknown attribution; a file absent from the Git baseline has an empty baseline. Do not filter findings solely by changed lines. External files, runtime targets, and other context are not preserved by a selected-file baseline; review context-sensitive findings accordingly. Treat recommendations as review findings, not automatic proof of bugs.

## Bundled resources

Run only [scripts/lint.mjs](scripts/lint.mjs) for routine checks. It automatically uses [file profiles](assets/profiles.mjs), [ESLint configuration](assets/eslint.config.mjs), [dependency requirements](assets/dependencies.json), [runtime support](scripts/runtime.mjs), [module loading support](scripts/runtime-loader.mjs), [documentation source](assets/documentation.json), [documentation support](scripts/documentation.mjs), and [comparison support](scripts/compare.mjs); do not run these helpers or manage their resources manually. The [validation script](scripts/test.mjs) is not required for routine checks.
