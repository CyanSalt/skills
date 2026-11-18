---
name: design-as-them
description: Creates and refines a user's personalized design-as-me skill through diverse HTML samples, user critique, transferable principle updates, fresh-agent generation, verification, and explicit final approval. Applies when a user asks to create or calibrate a personal design skill, learn their aesthetic preferences from page reviews, or continue iterative design calibration. Handles the complete skill-development and cleanup process without embedding a particular user's taste or sample layouts in the reusable method.
---

# design-as-them

Develop one user's personalized design skill. This skill owns elicitation, principle
updates, generation rounds, verification, approval, and cleanup. `design-as-me` contains
only reusable design guidance and personal preferences, not this development workflow.
Read [references/per-user-skill.md](references/per-user-skill.md) when creating or checking
the personalized skill's structure.

## 1. Establish scope and initialize

- Inspect existing instructions, materials, and skills before writing. Resolve the
  intended user's isolated output location and the page-design goals. Ask only for
  missing decisions that materially change the work; do not collect identity details.
- Follow the available skill-creation guidance and initializer for a new skill. Use the
  user's explicitly chosen location, otherwise the environment's documented default.
  Never overwrite an existing personalized skill or merge another user's preferences.
- Start an uncalibrated `design-as-me/SKILL.md` with valid name/description frontmatter
  and an empty principles section. Include all operative preferences in its body, not
  references. Do not seed it with another user's rules or guessed personal taste.
- Establish ten distinct page purposes and essential functions. Keep functional briefs
  separate from visual prescriptions. Use synthetic data and independent standalone
  HTML files with only the interactions needed to evaluate design.
- Track approval and versions outside the personalized skill. Record the specific files
  created by this task so later cleanup has a bounded, verifiable scope.

## 2. Generate a complete round with fresh context

- Freeze the complete current design principles without summarizing away preferences,
  quantitative limits, exceptions, or role distinctions. Check the frozen text against
  the authoritative skill before generation.
- Split the ten independent purposes into a small number of balanced parallel groups.
  Create new generation agents each round. Each group owns generation and minimal
  verification end to end; never reuse a previous author's conversation or output.
- Give generators only the frozen principles, independent functional briefs, synthetic
  data, and necessary execution instructions. Do not provide prior HTML, screenshots,
  raw critique, task or plan history, repository diffs/index, or other generators' work.
  Keep input and working directories separate and record actual read boundaries; do not
  claim system-level context inheritance has been disabled.
- Generate all ten purposes as new files each active round, even if feedback covers only
  a subset. Pages without targeted critique test transfer: they receive the same general
  principles and no page-specific design coaching or copied visual implementation.
- Preserve old files during iteration. Use purpose-based filenames in a new round
  directory and identify the actual round in browser titles to prevent version confusion.

## 3. Verify and deliver for critique

- Inspect the final wide and narrow renders, applicable design principles, and at least
  one meaningful interaction per page. Verify functional coverage against the brief.
  File existence, keyword matches, screenshots, and synthetic events are not interchangeable
  evidence. Report what was actually tested and what remains unverified.
- Check known failure modes from the principles without adding new taste prescriptions
  to transfer-test pages. Fix confirmed defects in the artifact and recheck affected
  states; do not ask the user to rediscover a known violation.
- Deliver the actual ten versioned HTML files and a short explanation of review scope.
  The user critiques them in the conversation or a file they choose. Do not build a
  review website, collection form, automated aesthetic score, or large test harness.
- Stop and wait for feedback. Technical success is not aesthetic approval; silence or
  praise for some pages does not approve the others.

## 4. Distill critique without losing established rules

- Read the latest feedback fully and resolve which artifact/version it concerns. Honor
  corrections and withdrawals. Verify factual premises separately from preserving taste;
  subjective preferences are as important as general design rules.
- Identify the reusable decision behind each comment. Organize principles by design
  concern and express conditions through purpose, role, or behavior, not sample names.
  Merely removing filenames from a control-specific recipe is not sufficient abstraction.
- Merge overlapping principles locally. Preserve established constraints, quantitative
  requirements, and exceptions unless the user changes them. Compare before/after coverage
  so abstraction never becomes dilution, inversion, or accidental deletion.
- Keep all operative principles in the personalized skill's body with equal standing.
  Retain only necessary generic examples; do not store the complete critique transcript
  or private business data in the skill. Distinguish unsupported new taste assumptions.
- Ask only about a material conflict or ambiguity. A corrected rationale does not erase
  the preference. Do not invent new rules when no new feedback supports them.
- In an active generation request, verify the revised skill and return to step 2 for
  all ten pages. A request only to audit or edit skill text does not authorize generation.

## 5. Validate the skill and obtain final approval

- Check name/description frontmatter, clear triggers, third-person description, applicable
  repository language rules, and direct references to every bundled resource. Run the
  available skill validator; disclose missing checks rather than installing dependencies
  or claiming success. Run and lint any bundled scripts under the repository's rules.
- Remove unused scaffold resources and temporary files only after identifying them as
  task-created. Keep the skill as an ordinary folder, not an unsolicited archive.
- Confirm the personalized skill works as design guidance without this conversation,
  sample filenames, or generation-round procedures. Principles must transfer to purposes
  without targeted critique, not merely reproduce the original examples.
- Finish learning only when the user explicitly approves the personalized skill as final
  or confirms all current pages satisfy them. Freeze that approved text; do not keep
  rewriting it or generating rounds because a checklist still contains unreviewed entries.
- Deliver the complete skill folder/files at their actual location, state validation
  coverage and any limitations, and explain how to use the final `design-as-me`.

## 6. Clean up within the user's selected scope

- Establish whether the user wants to retain final samples and review materials. Delete
  only the identified task-created rounds, screenshots, duplicate outputs, and temporary
  plans covered by that decision. Preserve final skills and user-owned materials by default.
- Do not clear the repository, alter staged content, install extra copies, publish, or
  modify system tools. Use read-only Git checks without optional-lock writes. Never
  restore an index merely to make its protection hash appear unchanged.
- Close only resources this task created and owns through a specific handle; never kill
  processes by broad name matching or delete an unverified shared temporary directory.
- Recheck the approved skill's integrity, retained files, and deletion scope. Report
  cleanup results and any retained staged entries plainly. Later refinements resume only
  at the user's request and preserve the accepted baseline.
