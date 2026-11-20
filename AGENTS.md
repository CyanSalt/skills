# AGENTS.md

## Scope

These instructions apply to this repository and all of its subdirectories.

## Project Instructions

- Write the `description` field in Skill frontmatter in the third person. For example, use `Generates ...` instead of `Generate ...`.
- Every Skill frontmatter `description` must state when to use the Skill with explicit trigger wording such as `Applies when ...`, `Use when ...`, `if ...`, or `for ...`; describe concrete tasks or contexts, not just capabilities, and do not leave usage conditions only in the body.
- Limit `description` to information an agent needs before loading the Skill: its purpose, relevant scope, and trigger or mandatory loading conditions. Keep execution steps, implementation details, repair decisions, and result interpretation in the body or appropriate resources; do not duplicate them in discovery metadata.
- Write every Skill in this repository in English, including `SKILL.md`, references, and comments in bundled resources.
- Every resource must be referenced from `SKILL.md`; delete any resource that is not referenced there.
- JavaScript scripts bundled with a Skill must pass `oxlint` with no errors (`npx oxlint@latest <path>`).
- When creating, reviewing, or changing a Skill, read and follow [docs/0001-skill-authoring.md](docs/0001-skill-authoring.md).
- Keep `SKILL.md` focused on what the executing agent needs: workflow, inputs, relevant prerequisites, side effects, result interpretation, limitations, and completion checks. Keep essential domain rules and output preferences explicit; do not add design history or maintenance explanations.
- Keep configuration maps, exception lists, and dependency specifications in their maintained configuration or manifest. Link to them rather than copying their contents into `SKILL.md`; retain exact details only when needed to execute.
- Use direct, conditional references for execution-time detail in the Skill's `references/` directory. State which bundled resources to run, read, or use; keep maintainer-only documents outside the Skill.
- Verify changed behavior through the actual Skill entry point. Metadata validation and code linting do not replace execution checks.
- Keep this file limited to repository-wide rules. Put Skill-specific decisions, implementation constraints, and maintenance notes in the repository-root `docs/` directory; do not include them in distributed Skill folders. For `lint-as-if-perfect` maintenance, read [docs/0002-lint-as-if-perfect-maintenance.md](docs/0002-lint-as-if-perfect-maintenance.md).
- Name Markdown files in the repository-root `docs/` directory as `NNNN-topic-name.md`, starting at `0001` and using the next available four-digit number. Preserve existing numbers and update references when moving or renaming files. Use descriptive names without required numbering in Skill `references/` directories.
- Keep each Markdown paragraph or list item on one source line; do not hard-wrap prose at a fixed column width.
