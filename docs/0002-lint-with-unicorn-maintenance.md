# Lint With Unicorn maintenance

Applies to [lint-with-unicorn](../skills/lint-with-unicorn/SKILL.md). Unless stated otherwise, source paths and commands in this document are relative to `skills/lint-with-unicorn/`; run maintenance commands from that directory.

## Runtime contract

Keep dependency discovery in the wrapper and syntax/preset selection in the ESLint configuration. Keep that configuration as an explicit flat array: define each language or dialect directly, keep optional dependency loading separate, and put shared rule exceptions last. Do not generate configuration blocks with nested loops or language-name inference. Fully expand every object in `assets/dependencies.json`. Declare `*` for runtime dependencies and `^6.0.3` for TypeScript. Ask npm for versions satisfying each range, select the highest stable version without relying on result order or the latest dist-tag, record concrete installed versions locally, and include those versions in result cache keys. Do not replace ranges with string equality checks against installed versions. `--no-install` must reuse recorded matching resolutions without accessing the network.

Use `--config` from the target working directory: ESLint evaluates alternate-config file globs relative to that directory. Load modules explicitly from the isolated runtime so neither the project's dependency versions nor the configuration file's installation location affect module resolution. Do not use project-local `npx eslint`.

Install only selected dependency groups when their installed versions differ from freshly resolved registry versions. Prefer pnpm on `PATH` and reuse its shared store with `--prefer-offline`; fall back to npm only when the pnpm executable is absent, not after a failed probe or installation. Keep npm for registry metadata resolution. Forward npm's effective default and scoped registry routes to pnpm so discovery and installation use the same registries, including pnpm versions that no longer read registry settings from `.npmrc`. Disable lifecycle scripts for both installers and disable pnpm hooks and parent-workspace discovery. Keep installer manifests and lockfiles inside the isolated runtime. Follow the user's npm registry configuration; do not silently switch registries on a failed install. If a mirror has incomplete package metadata, report the missing package/version and retry with a different registry only when the environment permits it. A filesystem installation lock prevents concurrent installers from modifying the same runtime simultaneously. An interrupted process can leave the lock behind; fail with its location rather than silently deleting a potentially active lock. Network access is needed on a cold installation; `--no-install` makes missing dependencies an explicit setup failure.

The runtime intentionally uses parsing-only TypeScript. Preserve official Unicorn presets except for the authorized overrides at the end of `assets/eslint.config.mjs`; those exception blocks and their adjacent comments are the maintained source for settings and reasons. Keep rule keys and replacement keys sorted by name, and add a concise English comment explaining each override. Scope enabled script-only overrides to script file profiles; do not leak them into ESLint non-JavaScript languages. Apply exception blocks after all language presets so none can undo them. Keep default naming replacements outside the explicit exceptions unchanged. Do not add other plugins' recommended rules or alter other reviewed candidates without authorization. Optional type-sensitive rules may have less information in this mode; this command is not a type-checking replacement.

## Documentation prerequisites

Prepare Unicorn documentation before linting, together with dependency installation, under the same runtime installation lock. `assets/documentation.json` records only the package and archive endpoint. Obtain `gitHead` for the resolved and installed Unicorn release from npm metadata; require a valid commit, download that commit's archive, and verify its package name/version matches the installed plugin. Never use main-branch documentation. Record the archive and extracted-file digests for cache validation. Extract only regular Markdown documentation files, the license, and package metadata used for version validation. Reject traversal paths and links; never execute archive content.

Publish validated documentation from a temporary staging directory. Record file digests and validate cached content before reuse; missing or corrupt documentation fails under `--no-install` and is re-prepared when downloads are allowed. Keep documentation outside the target project and skill source tree. Every emitted Unicorn diagnostic must include a readable absolute `documentationPath`; include the overview and rules-directory paths in repair guidance, including findings without automatic fixes or suggestions.

## Baseline semantics

`--base` compares a commit with current on-disk content, not just staged content. `--changed` selects tracked differences, detected renames, and non-ignored untracked files. It never fetches a remote, checks out a branch, stages files, or edits the index. Resolve branch merge bases explicitly outside the wrapper.

Copy only selected baseline source into a disposable directory and check it with the same language groups and configuration as current content. Preserve relative filenames for file-sensitive rules. A detected rename compares old contents under the current filename: content findings remain comparable, but this does not detect filename-only regressions from the old name. Do not represent a whole-file filename finding as newly caused by a content edit.

Snapshots capture selected source before edits, independently of Git. They record the working directory and configuration fingerprint and reject mismatched configurations. They do not capture an entire repository: a current path absent from the snapshot has unknown attribution, even if it looks like a new file. Snapshot directories are created exclusively and never overwritten.

Baseline parse errors prevent reliable attribution, including when the current file parses. Parsing findings always remain unknown and exit with code 2. Moved or edited duplicates are ambiguous: retain them as unknown instead of consuming a weak match and hiding a real new instance. Matching compares message identity and severity plus a source excerpt; it does not prove semantic causality or authorship.

Only selected source files are compared. Rules reading external files, package metadata, runtime compatibility targets, time-dependent TODOs, or type information can vary with context not preserved in a selected-file baseline. Account for such context during review; do not claim a source-only baseline reproduces the entire historical environment.

## Caching and scale

Current-file ESLint caching uses contents and configuration/version fingerprints. Caches are outside the project. The cache does not track changes in external files; use `--no-cache` when context-dependent rules need reevaluation. Baseline checks are uncached until an immutable-context cache can preserve the same semantics; only selected files are checked.

Batch selected files in one ESLint process and load only required language groups. Worker startup and plugin loading can dominate tiny selections, so concurrency defaults to off. Installation occurs only when selected resolved versions change or a language group is missing. Measure cold dependency installation, uncached lint, repeated cache hits, and baseline comparison separately; do not promise a runtime bound without representative measurements.

Keep per-file memory and CLI argument limits in mind when expanding very large directory requests. This is an on-demand selected-file audit rather than an unbounded repository indexing service.

## Repair behavior

Keep ordinary checks and snapshots read-only. Translate `--fix --dry-run` to ESLint's native `--fix-dry-run`, and `--fix` alone to ESLint's native `--fix`, after validating current and baseline files. Require `--fix` when `--dry-run` is supplied. Never pass fix flags to baseline linting. Block repairs before writing if current or baseline parsing fails. File-wide CLI fixes include historical findings; do not advertise attribution-filtered autofix. Incremental repair requires reviewing previews and selecting authorized changes before writing.

Compare remaining diagnostics using the post-fix or preview source. Preserve preview `output` and original ESLint `fix`/`suggestions` fields. Suggestions are explicit alternatives for agent review and must not be applied automatically. Include repair mode, changed files, remaining fix/suggestion counts, and an actionable next-step hint in output. Preview ranges refer to preview output; recheck actual content after agent edits to avoid stale offsets.

`--fix` is not a repository transaction: ESLint may have written some selected files if a later error occurs. Report failure and inspect current files rather than blindly retrying or rolling back user edits. Never modify the Git index, baseline snapshots, project configuration, or dependency manifests during source repair.

## Validation

Run `node scripts/test.mjs` from this skill directory. Tests create a disposable project and exercise every advertised extension through the actual isolated ESLint CLI, including nonstandard JSX suffixes, Vue JS/TS scripts, language presets, configuration isolation, snapshots, Git renames, error exits, cache reuse, worker mode, real autofixes, read-only previews, suggestion-guided repairs, parsing-error write prevention, version-matched documentation, offline reuse, and missing/corrupt document detection. They resolve and install selected runtime dependencies in the normal isolated cache and verify TypeScript's semver constraint and documentation alignment. Put pnpm on `PATH` to exercise real pnpm cold installation and extension; installer fixtures also cover npm fallback, registry forwarding, failed probes/installs, and offline non-invocation.

Run `npx oxlint@latest assets scripts` and the skill frontmatter validator after modifications. Do not add generated caches, fixture repositories, node_modules, or runtime package-manager lockfiles to the skill. Keep every bundled resource linked from `SKILL.md`.
