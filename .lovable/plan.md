
# Apr–Jul 2026 Feature Audit — Plan

## Goal
Produce a single markdown file `CHANGELOG_APR_JUL_2026.md` at the project root listing every meaningful feature/change shipped between **2026-04-01 and 2026-07-07**, grouped by month and by surface (Rep mobile, Internal dashboard, Distributor portal, Customer portal + WhatsApp, Platform/infra). No code changes, no automated tests — just the changelog you can use as a manual test list.

## Inputs (already surveyed)
- **3,391 git commits** in the window (`git log --since=2026-04-01 --until=2026-07-08`).
- **204 supabase migrations** in `supabase/migrations/` dated 20260401–20260708.
- **Lovable chat history** for this project (via `recall_chat_history` / `search_chat_history`).

## Method

1. **Mine git** — dump commits with date + subject, drop noise (`chore:`, `wip`, `merge`, revert-and-restore pairs, doc-only, formatting), then cluster remaining subjects by keyword into feature themes.
2. **Mine migrations** — for each of the 204 SQL files, extract the first meaningful DDL/RPC/policy line to label it (new table, new RPC, policy change, trigger, cron). Group by area.
3. **Mine chat history** — run 4 parallel `recall_chat_history` sweeps (one per month) to catch feature decisions/renames that aren't obvious from commit subjects, plus any explicit "we shipped X" moments.
4. **Merge & dedupe** — one bullet per feature, not per commit. Each bullet: *feature name — 1-line what it does — surface tag — month first shipped*. Cross-reference migration file + representative commit SHA where useful so you can jump to code.
5. **Group** the merged list into the deliverable structure below and write the file.

## Deliverable structure

`CHANGELOG_APR_JUL_2026.md`:

```text
# Feature Changelog — Apr–Jul 2026

## How to use this
- Each bullet = one shippable feature to smoke-test.
- Tags: [Rep] [Dashboard] [Distributor] [Customer/WhatsApp] [Platform]

## April 2026
### Rep mobile
- ...
### Internal dashboard
- ...
### Customer portal + WhatsApp
- ...
### Platform / infra (RLS, migrations, cron, edge fns)
- ...

## May 2026
(same structure)

## June 2026
(same structure)

## July 2026 (through Jul 7)
(same structure)

## Appendix — noteworthy DB changes
- New tables, new RPCs, new triggers, new pg_cron jobs (from the 204 migrations).
```

## Scope boundaries
- **Included:** Rep mobile app, `/dashboard`, `/distributor-portal`, customer portal, WhatsApp automation, edge functions, DB schema/RLS changes, cron jobs — i.e. "everything" as you selected.
- **Excluded:** pure refactors, dependency bumps, styling tweaks, doc edits, revert churn.
- **Not included in this task:** writing automated QA actions or executing tests. This is the reference list you'll test against.

## Execution notes (technical)
- Use `acp_subagent--spawn_agent` to parallelize: one subagent per month for git+migration digestion, one for chat-history recall. Each returns a structured bullet list; the main turn merges them.
- Cap the output file at ~1,500 lines so it stays reviewable; overflow goes to the appendix.
- No files other than `CHANGELOG_APR_JUL_2026.md` will be created or modified.
