# AGENTS.md

## Scope

These instructions apply to this repository and all of its subdirectories.

## Project Instructions

- Write the `description` field in Skill frontmatter in the third person. For example, use `Generates ...` instead of `Generate ...`.
- Every Skill frontmatter `description` must state when to use the Skill with explicit trigger wording such as `Applies when ...`, `Use when ...`, `if ...`, or `for ...`; describe concrete tasks or contexts, not just capabilities, and do not leave usage conditions only in the body.
- Write every Skill in this repository in English, including `SKILL.md`, references, and comments in bundled resources.
- Every resource must be referenced from `SKILL.md`; delete any resource that is not referenced there.
- JavaScript scripts bundled with a Skill must pass `oxlint` with no errors (`npx oxlint@latest <path>`).
- Keep this file limited to repository-wide rules. Put Skill-specific
  decisions, implementation constraints, and operational notes under `docs/`.
