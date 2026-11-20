# Skill authoring guide

Applies when creating, reviewing, or changing a Skill in this repository. This guide defines repository policy, informed by the [open specification](https://agentskills.io/specification) and the authoring guides listed under Sources. The information boundaries below are local requirements, not additional requirements of the open format.

## Information boundaries

For each paragraph, ask: **Would an agent need this information to choose an action, execute the task safely, interpret the result, or verify completion?** If not, remove it from `SKILL.md` or place it in maintainer documentation.

- **`SKILL.md`**: capability and scope, necessary inputs and prerequisites, the normal workflow, decision points, side effects, result interpretation, relevant limitations, and completion checks. Keep essential domain rules and personal preferences that determine the output here; concision must not hide them.
- **`references/`**: execution-time detail needed only for a particular branch, such as an API reference, schema, advanced procedure, or extended examples. Explain in `SKILL.md` when to read each file.
- **Configuration and manifests**: executable settings, rule maps, allowlists, dependency specifications, and other machine-owned values. Link to the maintained file rather than duplicating its contents in prose.
- **Repository-root `docs/`**: implementation rationale, design tradeoffs, algorithms, maintenance constraints, development setup, and test commands, including Skill-specific material. Keep these documents outside distributed Skill folders and link them from repository authoring or maintenance instructions.
- **Repository `AGENTS.md`**: rules shared by authors of all Skills and pointers to applicable repository documentation. Keep Skill-specific choices in the linked maintenance document.

Use `NNNN-topic-name.md` names for Markdown files in repository-root `docs/`. Skill `references/` files use descriptive names without required numbering. Do not create Skill-local `docs/` directories for maintainer material.

Specificity is useful when it changes execution. Preserve exact CLI syntax, required output fields, supported input boundaries, minimum runtime requirements, write behavior, and relevant failure conditions. Do not replace these with vague instructions in the name of brevity.

Do not put implementation choices, decision history, changelogs, review findings, test-run results, or copied configuration inventories in the runtime instructions. A short operational consequence may belong there; the rationale and complete settings belong with their maintained source.

Examples of placement:

- A naming-exception map belongs in configuration. The workflow can link to that configuration without repeating the exempt names.
- Dependency ranges belong in a manifest. Manual installation requirements and runtime minimums belong in the instructions when the executing agent must act on them.
- Cache placement, offline behavior, and write boundaries can affect safe use. Cache-key algorithms and installer internals belong in maintenance documentation.
- The user's output preferences are execution requirements. Keep them visible in the core instructions when they apply to every invocation.

## Concision and navigation

- Keep one authoritative location for each rule or value. Use a short link where a second mention is necessary; do not reproduce lists in multiple files.
- Keep `SKILL.md` below 500 lines as an authoring target, not a quota or proof of quality. Split branch-specific detail before it makes the normal workflow hard to follow.
- Put common steps in the main workflow and load only the selected branch's references. Do not require every invocation to read every bundled resource.
- Link every bundled resource directly from `SKILL.md` with a relative path from the Skill root. State whether to run a script, read a reference, or use an asset. Do not reference repository maintenance documents from runtime instructions; the Skill must remain usable independently of this repository.
- Avoid nested chains that hide required instructions. Give reference files over 100 lines a contents list or useful section index.
- Use concise, imperative instructions and consistent terminology. Give a default approach and only the alternatives with a real decision condition.
- Use small examples that clarify execution or output. Do not copy task-specific source material, private data, or a sample article into reusable rules; extract the generalizable requirement.
- Do not create empty resource directories, placeholder files, redundant quick-start documents, or unrelated appendices.

## Scope and discovery

- Match the frontmatter `name` to the directory name and follow the open specification's naming and length limits.
- Write `description` in the third person. Include what the Skill does and explicit, concrete trigger conditions; the body is read after discovery. Apply the pre-load information boundary in `AGENTS.md`: execution and result-review rules belong in the body or appropriate resources.
- Keep the Skill focused on a coherent task. Do not claim adjacent capabilities or add unrelated workflows merely to broaden triggering.
- Distinguish required behavior from defaults and optional choices. Do not turn one observed example into a hard-coded rule for all inputs.
- Follow the intended host's supported metadata and capabilities. Do not import provider-specific fields, restrictions, packaging, or tool assumptions as universal repository requirements.

## Execution and verification

- Declare prerequisites the executing agent must prepare or verify. Do not assume a tool, package, network connection, or account is available; state actionable failure behavior when it is missing.
- Reuse bundled scripts for deterministic or repetitive work. Explain their invocation and output contract without requiring the agent to reimplement or study their internals.
- State which actions write source files or external state. Preserve the requested scope; an inspection workflow must not silently become a repair or publishing workflow.
- For quality-critical work, include an execution-time check, repair, and recheck loop. Distinguish previews from saved results and findings from setup failures.
- Verify added or changed behavior through the actual Skill entry point with representative inputs, boundary cases, and failure cases. A metadata validator or general-purpose linter alone does not establish that the Skill works.
- Check that intended tasks are discoverable, near-miss tasks remain outside scope, and a reader without the authoring conversation can locate and follow the required resources. Report which checks were actually performed; do not claim independent-agent or cross-host testing unless it ran.
- Keep generated reports, caches, downloaded dependencies, and temporary fixtures outside the published Skill. Retain only resources needed for execution or its bundled validation scripts; keep maintainer-only explanations in repository-root `docs/`.

## Review checklist

Before delivery, verify:

- Every main-body paragraph passes the execution-relevance question.
- Essential behavior and output preferences remain explicit; only incidental detail has moved.
- Configuration values and dependency inventories have one maintained source.
- Maintainer-only explanations are separated from runtime references.
- Trigger descriptions, links, commands, and documented side effects match the actual implementation.
- New constraints generalize beyond the example that motivated them.
- Relevant execution checks ran, and unresolved limitations are stated without claiming success.

## Sources

These sources support concise instructions, progressive disclosure, clear discovery, appropriate specificity, and evaluation through real usage. The repository-specific placement rules above apply those principles to this repository.

- [Agent Skills specification](https://agentskills.io/specification): format, metadata, resource organization, progressive disclosure, and relative references.
- [Anthropic Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices?content_language=English): concision, degrees of freedom, workflows, reference navigation, and feedback loops.
- [OpenAI open-source skill creator](https://raw.githubusercontent.com/openai/skills/main/skills/.system/skill-creator/SKILL.md): non-obvious execution guidance, separation of resources, avoiding duplication, and real script validation.
- [Anthropic open-source skill creator](https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md): generalizing feedback, keeping prompts lean, and evaluating actual task behavior.
