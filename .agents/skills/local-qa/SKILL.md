---
name: local-qa
description: 'Plan and run auditable local QA for web apps, Obsidian plugins, or both. Use when the user says "QA this locally", "test this in Obsidian", "browser QA", "full app QA", "manual QA", "taste test this", or asks for reviewable product QA evidence.'
argument-hint: '[--confirm] [--interview] [--web|--obsidian|--both] <scope>'
---

# Local QA

Run product-minded local QA against the real app, then write an auditable report under `thoughts/shared/qa/`. The goal is to exercise flows too bespoke for unit tests and judge whether the user experience is good enough, not to prove that functions return expected values.

$ARGUMENTS

## Boundary

Use this when:
- The user asks for local QA, manual QA, Obsidian QA, browser QA, full-app testing, visual review, or taste testing.
- The changed surface is user-facing and unit tests do not answer whether the flow feels right.
- Evidence matters: screenshots, videos, traces, console output, network requests, exact setup, and notes a reviewer can audit later.

Do not use this when:
- The task is to add or fix automated tests, use normal repo test tooling.
- The task is only code review.
- The task is production incident triage.

## Arguments

```text
local-qa [--confirm] [--interview] [--web|--obsidian|--both] <scope>
```

This is shorthand, not a parser. Read the user's request as intent.

- `scope` is the change, branch, PR, feature, or flow to QA. Default to the current branch diff.
- `--web` runs the web app/browser surface only.
- `--obsidian` runs the full Obsidian plugin surface only.
- `--both` runs both. Default to both when the diff can affect both surfaces.
- `--confirm` drafts the matrix and waits before running. Without it, run fully automatically.
- `--interview` writes a brief for a local QA agent, folds useful feedback into the matrix, then runs. The interview is input, not a gate.

Default mode is fully automatic. Do not ask the user to approve the matrix unless they passed `--confirm`.

## Process

### 1. Inspect The Change

Read enough to understand the user-facing risk:

- `git status`, `git log <base>..HEAD`, and `git diff <base>...HEAD`.
- Changed package scripts and app entry points.
- Relevant architecture docs under `architecture-docs/`.
- Existing unit/e2e coverage so QA does not duplicate what tests already answer.

Recover the product question, not just the changed files. "PDF selection playback" is not only a CodeMirror change; it is selection behavior, command/menu affordance, playback feedback, cancellation, provider request shape, and visual state.

### 2. Build The Matrix

Keep the matrix private unless `--confirm` was passed. Use 4-8 rows. Each row must answer a product or integration question that tests do not cover well.

Good rows:
- "Does highlighted playback feedback feel responsive after starting from a PDF text selection?"
- "Does the settings modal stay readable when switching providers with provider-specific fields?"
- "Does the command/menu affordance match what an Obsidian user would try first?"
- "Does the error state tell the user what to fix when a real provider request fails?"
- "Does the web harness match Obsidian behavior closely enough, or is there an integration gap?"

Bad rows:
- "The command runs."
- "The component renders."
- "The request has key X." That belongs in automated tests unless the visible UX around the request is what matters.

### 3. Run Real QA

Prefer real provider requests when runtime environment variables are already available. Never read `.env` directly. If a required variable is missing, mark that row blocked and continue with rows that do not need it.

Use mocks only when the row is explicitly about local UI mechanics and the provider would add noise, cost, or nondeterminism without changing the product judgment. Do not let mocks become the default. The point is to catch the awkward edges that only show up when the app does real work.

For web QA:
- Start the local app with the repo's scripts, usually `pnpm web:dev`.
- Use Browser or Playwright for real interaction.
- Capture screenshots for visual states, traces/videos for multi-step behavior, and console/network output when relevant.
- Record the exact URL and commands used.

For Obsidian QA:
- Build the plugin with the repo's scripts.
- Prefer an existing Obsidian vault named `test-plugin`. Search common vault locations first, then use the path the user gives if they have one. Never use the user's normal notes vault unless explicitly asked.
- If `test-plugin` does not exist, create it in a stable local location such as `~/Documents/test-plugin`, install the plugin, seed the notes/PDFs needed for QA, and ask the user to populate provider secrets in that vault's plugin settings before provider-dependent rows run.
- Do not read, print, or copy provider secrets from the vault. If the settings UI indicates secrets are missing, say which provider needs setup and pause only those rows.
- Install the built plugin into `test-plugin/.obsidian/plugins/<plugin-id>/`.
- Seed notes, PDFs, settings, and selections needed for the rows without destroying existing test fixtures.
- Launch Obsidian against `test-plugin` and use desktop automation for real UI interaction.
- Capture screenshots/videos of the actual Obsidian UI, plus logs or plugin console output if available.

For both:
- Run web first when it gives fast coverage of shared UI/audio behavior.
- Run Obsidian second for integration points web cannot prove: Obsidian commands, menus, editor/PDF selection, vault storage, plugin settings, mobile/desktop affordances, and app chrome constraints.

### 4. Push Back

Be willing to call the product not good enough. A QA report that only says "works" is usually useless.

Use direct notes:
- "Works, but the pause state is visually ambiguous."
- "This feels awkward: the user has to leave the PDF context to see whether playback started."
- "The error message is technically accurate but does not give the user a next action."
- "The settings layout is too cramped after provider switch; this needs design attention before release."

Do not hide product judgment behind neutral transcript language. Evidence comes first, but the notes should say what a careful reviewer would notice.

### 5. Write The Report

Write the report to:

```text
thoughts/shared/qa/<date>-<scope>.md
```

Put large or binary artifacts under:

```text
thoughts/shared/qa/raw/<date>-<scope>/
```

No manifest. Link artifacts directly from the report row. Use relative links so the report remains readable in the repo.

Report template:

```md
# QA: <Scope>

Branch: <branch>  Commit: <short sha>
Mode: web | obsidian | both
Real requests: yes/no, provider(s)

## Product Questions

- <What should the reviewer judge?>
- <What might feel wrong even if tests pass?>

## Findings

- P1/P2/P3: <product or behavior finding with artifact links>

## Rows

### 1. <Flow Name>

Setup:
```
<commands, app URL, vault path, or fixture notes>
```

Evidence:
- [screenshot](raw/<date>-<scope>/<file>.png)
- [trace](raw/<date>-<scope>/<file>.zip)
- [video](raw/<date>-<scope>/<file>.webm)

Notes:
- <taste judgment>
- <behavioral observation>
- <console/network issue if relevant>

## Blocked Or Not Covered

- <Missing env var, app launch issue, unavailable fixture, or intentionally skipped row>
```

Rules:
- Show the evidence. Do not substitute a summary when a screenshot, video, trace, or verbatim output would let the reviewer judge directly.
- Keep setup reproducible. Include exact commands, vault path, app URL, provider, and fixture names.
- Keep secrets out. Never paste API keys, tokens, account identifiers, or sensitive local paths that do not help the reviewer.
- Preserve the `test-plugin` vault between runs. It is allowed to hold QA provider settings and secrets; the report should mention whether rows used existing configured providers or were blocked waiting for setup.
- Do not add a "test plan" section to PR bodies. The QA report is internal evidence, not PR boilerplate.

## Interview Mode

Only when `--interview` is passed:

1. Write `thoughts/shared/qa/<date>-<scope>-qa-agent-brief.md`.
2. Ask the local QA agent for:
   - highest-risk flows in this diff
   - weird or awkward UX risks
   - rows that require full Obsidian instead of web
   - evidence worth capturing
   - what would make the change not good enough
3. Incorporate the useful parts into the matrix.
4. Run QA. Do not wait for another approval unless `--confirm` was also passed.

The QA agent is a source of sharp test ideas, not an authority. Reject rows that are too broad, not evidence-driven, or covered better by automated tests.

## Exit Checklist

- [ ] Report exists under `thoughts/shared/qa/`.
- [ ] Every finding links to evidence or says why evidence could not be captured.
- [ ] Real provider requests were used where runtime env made that feasible.
- [ ] Obsidian QA used `test-plugin`, created it if needed, and asked the user for provider setup only when required.
- [ ] Blocked rows are separated from findings.
- [ ] Final chat reply points to the report and calls out only blocking product issues.
