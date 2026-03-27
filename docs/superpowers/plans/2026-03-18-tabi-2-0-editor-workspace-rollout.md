# Tabi 2.0 Editor Workspace Rollout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the current Tabi 2.0 rollout with the approved handbook-first product shape: source-data-driven generation, always-on GrapesJS handbook editing, right-side `Edit / Spots / Remix`, and spots CSV derived from resolved spots actually used by the generated handbook.

**Architecture:** Keep the current `Session + Handbook + SessionState` persistence model and avoid Prisma changes. Move visible 2.0 behavior away from block/session editing by making `session_analysis` the main source-data contract, keeping any `blocks / spot_blocks` usage internal and compatibility-only, and making the handbook canvas the default editing surface. Preserve the existing handbook save path and layer new `used_spot_ids` metadata into generation so `Spots` can stay structured without parsing HTML.

**Tech Stack:** Next.js App Router, React 19, Zustand, Prisma/Postgres, AI SDK, `grapesjs@0.22.14`, `@react-google-maps/api`, existing handbook/session APIs, node test runner, Tailwind CSS.

---

## References

Primary approved spec:

- [`docs/superpowers/specs/2026-03-18-tabi-2-0-editor-workspace-design.md`](/Users/jianghai/Desktop/ai-next/.worktrees/tabi-2-0-workspace-rollout/docs/superpowers/specs/2026-03-18-tabi-2-0-editor-workspace-design.md)

Technical companions still relevant:

- [`docs/version2.0/grapesjs-html-editing-architecture.md`](/Users/jianghai/Desktop/ai-next/.worktrees/tabi-2-0-workspace-rollout/docs/version2.0/grapesjs-html-editing-architecture.md)
- [`docs/version2.0/grapesjs-spots-ui-plan.md`](/Users/jianghai/Desktop/ai-next/.worktrees/tabi-2-0-workspace-rollout/docs/version2.0/grapesjs-spots-ui-plan.md)
- [`docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md`](/Users/jianghai/Desktop/ai-next/.worktrees/tabi-2-0-workspace-rollout/docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md)

This plan supersedes older rollout assumptions in:

- [`docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md`](/Users/jianghai/Desktop/ai-next/.worktrees/tabi-2-0-workspace-rollout/docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md)
- [`docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md`](/Users/jianghai/Desktop/ai-next/.worktrees/tabi-2-0-workspace-rollout/docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md)

## Scope

### In Scope

- Make the visible 2.0 product handbook-first and edit-first.
- Remove block/session editing as user-facing workspace concepts.
- Keep `analyze_session_data` as the main structured source-data tool contract.
- Add `used_spot_ids` or equivalent handbook spot manifest to handbook generation output.
- Derive `Spots` map/list/CSV from structured resolved spots intersected with used handbook spots.
- Make the center canvas always-on GrapesJS editing once a handbook exists.
- Make the right panel default to `Edit`, with `Spots` and `Remix` as secondary tabs.
- Preserve handbook persistence, preview, publish, and multi-handbook behavior.

### Out of Scope

- Full editor-agent execution through MCP.
- New database schema or Prisma migrations.
- Replacing all compatibility caches in one pass.
- Parsing HTML to reconstruct spots.
- Broad new test framework introduction.

## Constraints To Preserve

- **No Prisma migration** unless a blocker is discovered and reviewed first.
- **Keep `Handbook.html` as the persisted artifact.**
- **Keep existing handbook save routes stable.**
- **Do not require Edit Agent for editing.**
- **Keep compatibility caches available internally** while removing them from user-facing 2.0 semantics.
- **Prefer small, focused helpers and targeted tests** over broad rewrites.

## File Structure

### Existing files to modify

- `src/agent/tools/build-travel-blocks.ts`
  - keep persistence compatibility but make public 2.0 semantics source-data-first
- `src/agent/tools/resolve-spot-coordinates.ts`
  - return structured resolved spots and stop leaning on `spot_blocks` as the visible contract
- `src/agent/tools/generate-handbook-html.ts`
  - accept source-data-first inputs and return handbook spot usage metadata
- `src/agent/prompts/build-travel-blocks.ts`
  - keep analysis prompt aligned with non-block semantics
- `src/agent/prompts/handbook-html.ts`
  - require explicit spot usage manifest in output contract or structured sidecar
- `src/app/session/[id]/page.tsx`
  - route-level composition and workspace defaults
- `src/app/session/[id]/layout.tsx`
  - top toolbar semantics and handbook-first shell
- `src/app/session/[id]/_components/session-html-panel.tsx`
  - center handbook canvas chrome
- `src/app/session/[id]/_components/handbook-workspace-panel.tsx`
  - right-side tabs and tab defaults
- `src/app/session/[id]/_components/handbook-assistant-panel.tsx`
  - repurpose into the `Edit` workspace body instead of assistant-first behavior
- `src/app/session/[id]/_components/session-blocks-panel.tsx`
  - remove from normal 2.0 rendering path
- `src/app/session/[id]/_lib/spots-view-model.ts`
  - unify used spots, resolved spots, map rows, and CSV export inputs
- `src/app/session/[id]/_lib/session-output-utils.ts`
  - normalize source-data-first outputs and compatibility fallback reads
- `src/server/sessions.ts`
  - persist handbook source metadata including used spot ids

### Existing files to verify or lightly adjust

- `src/lib/session-analysis.ts`
  - source-data schema and compatibility derivation helpers
- `src/lib/session-analysis-tool.ts`
  - tool naming aliases
- `src/agent/context/persistence.ts`
  - latest tool output persistence and handbook metadata persistence
- `src/app/session/[id]/_actions/editor-actions.ts`
  - CSV export helpers and any remaining block-first assumptions
- `src/app/session/[id]/_stores/session-editor-store.ts`
  - center workspace defaults that still assume `blocks/html`

### Test files to add or update

- `tests/agent-tool-contracts-2-0.test.mjs`
- `tests/handbook-used-spots.test.mjs`
- `tests/spots-view-model.test.mjs`
- `tests/session-workspace-2-0.test.mjs`

## Chunk 1: Source-Data-First Tool Contracts

### Task 1: Stop Exposing Blocks as the Main 2.0 Tool Contract

**Files:**
- Modify: `src/agent/tools/build-travel-blocks.ts`
- Modify: `src/agent/tools/resolve-spot-coordinates.ts`
- Modify: `src/agent/tools/generate-handbook-html.ts`
- Modify: `src/agent/tools/types.ts`
- Modify: `src/lib/session-analysis.ts`
- Modify: `src/agent/prompts/handbook-html.ts`
- Test: `tests/agent-tool-contracts-2-0.test.mjs`
- Test: `tests/handbook-used-spots.test.mjs`

- [x] **Step 1: Write the failing tool-contract tests**

Add tests that lock these expectations:

- `analyze_session_data` still exposes `session_analysis`
- `resolve_spot_coordinates` returns structured resolved spots without making `spot_blocks` the required consumer path
- `generate_handbook_html` can work from source-data-first inputs
- handbook generation returns `used_spot_ids`

- [x] **Step 2: Run the new tool-contract tests to confirm current failures**

Run:

```bash
node --test tests/agent-tool-contracts-2-0.test.mjs tests/handbook-used-spots.test.mjs
```

Expected:

- at least one failing assertion around missing `used_spot_ids` and/or block-first assumptions

- [x] **Step 3: Implement the minimal source-data-first contract changes**

Update the tool layer so that:

- `blocks / spot_blocks` are compatibility-only outputs
- source-data fields remain the main public 2.0 contract
- handbook generation computes and returns `used_spot_ids`

Keep persistence compatibility for legacy step names and any temporary block derivation inside the implementation.

- [x] **Step 4: Re-run the focused tool tests**

Run:

```bash
node --test tests/agent-tool-contracts-2-0.test.mjs tests/handbook-used-spots.test.mjs
```

Expected:

- PASS for all assertions

- [ ] **Step 5: Commit the tool-contract alignment**

```bash
git add src/agent/tools/build-travel-blocks.ts \
  src/agent/tools/resolve-spot-coordinates.ts \
  src/agent/tools/generate-handbook-html.ts \
  src/agent/tools/types.ts \
  src/lib/session-analysis.ts \
  src/agent/prompts/handbook-html.ts \
  tests/agent-tool-contracts-2-0.test.mjs \
  tests/handbook-used-spots.test.mjs
git commit -m "feat: align 2.0 tools with source-data-first contracts"
```

## Chunk 2: Handbook-First Workspace Shell

### Task 2: Remove Block/Session Editing from the Visible 2.0 Workspace

**Files:**
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/app/session/[id]/layout.tsx`
- Modify: `src/app/session/[id]/_components/session-html-panel.tsx`
- Modify: `src/app/session/[id]/_components/handbook-workspace-panel.tsx`
- Modify: `src/app/session/[id]/_components/handbook-assistant-panel.tsx`
- Modify: `src/app/session/[id]/_components/session-blocks-panel.tsx`
- Modify: `src/app/session/[id]/_stores/session-editor-store.ts`
- Test: `tests/session-workspace-2-0.test.mjs`

- [x] **Step 1: Write the failing workspace tests for 2.0 defaults**

Lock expectations such as:

- handbook-ready state defaults the right panel to `Edit`
- the center workspace no longer depends on `blocks` mode to be usable
- old assistant-first wording is not the default handbook-ready state

- [x] **Step 2: Run the workspace tests to verify they fail before the UI changes**

Run:

```bash
node --test tests/session-workspace-2-0.test.mjs
```

Expected:

- FAIL on current block/assistant-first assumptions

- [x] **Step 3: Implement the center and right-shell changes**

Update the page shell so that:

- the center canvas is handbook-first and edit-first
- `Edit Handbook` style mode toggles disappear from the main UX
- `SessionBlocksPanel` is not part of the normal handbook-ready rendering path
- the right panel tabs become `Edit / Spots / Remix`
- handbook-ready state opens on `Edit`

- [x] **Step 4: Re-run the workspace tests and then build-check the route**

Run:

```bash
node --test tests/session-workspace-2-0.test.mjs
```

Expected:

- PASS

Then run:

```bash
npm run build
```

Expected:

- build succeeds with no route-level type errors

- [ ] **Step 5: Commit the workspace-shell changes**

```bash
git add src/app/session/[id]/page.tsx \
  src/app/session/[id]/layout.tsx \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/_components/handbook-workspace-panel.tsx \
  src/app/session/[id]/_components/handbook-assistant-panel.tsx \
  src/app/session/[id]/_components/session-blocks-panel.tsx \
  src/app/session/[id]/_stores/session-editor-store.ts \
  tests/session-workspace-2-0.test.mjs
git commit -m "feat: make tabi 2.0 workspace handbook edit-first"
```

## Chunk 3: Spots Workspace from Used Handbook Spots

### Task 3: Make Map/List/CSV Follow Used Spots Instead of Legacy Spot Blocks

**Files:**
- Modify: `src/app/session/[id]/_lib/spots-view-model.ts`
- Modify: `src/app/session/[id]/_lib/session-output-utils.ts`
- Modify: `src/app/session/[id]/_actions/editor-actions.ts`
- Modify: `src/app/session/[id]/_components/session-spots-panel.tsx`
- Modify if needed: `src/server/sessions.ts`
- Test: `tests/spots-view-model.test.mjs`

- [x] **Step 1: Write the failing spots view-model tests**

Lock these expectations:

- only resolved spots referenced by `used_spot_ids` appear in the CSV export set
- map markers, list rows, CSV rows, and Open Maps URL use the same ordered items
- unresolved but used spots can still appear in the list while being excluded from map markers and CSV rows

- [x] **Step 2: Run the spots view-model tests to confirm current failures**

Run:

```bash
node --test tests/spots-view-model.test.mjs
```

Expected:

- FAIL on the current fallback chain that still depends on `spot_blocks`

Implementation note:

- Existing branch state had already landed part of the spots filtering changes before this execution pass, so this test currently passes as regression coverage.

- [x] **Step 3: Implement the minimal structured spots pipeline**

Update the view-model flow so it:

- reads resolved spots from structured tool output or persisted handbook source data
- filters by `used_spot_ids`
- keeps ordering stable across list, map, CSV, and Open Maps
- stops treating CSV as the runtime data source

- [ ] **Step 4: Re-run the spots tests and smoke the UI manually**

Run:

```bash
node --test tests/spots-view-model.test.mjs
```

Expected:

- PASS

Implementation note:

- Automated re-run is complete (`node --test tests/spots-view-model.test.mjs` passes). Manual smoke remains pending.

Manual smoke checklist:

- `Spots` tab opens
- map renders valid markers when coordinates exist
- unresolved spots still show in the list
- `Download CSV` exports only used + resolved spots
- `Open Maps` opens a URL built from the same used + resolved ordering

- [ ] **Step 5: Commit the spots companion changes**

```bash
git add src/app/session/[id]/_lib/spots-view-model.ts \
  src/app/session/[id]/_lib/session-output-utils.ts \
  src/app/session/[id]/_actions/editor-actions.ts \
  src/app/session/[id]/_components/session-spots-panel.tsx \
  src/server/sessions.ts \
  tests/spots-view-model.test.mjs
git commit -m "feat: drive spots workspace from used handbook spots"
```

## Chunk 4: Docs, Verification, and Smoke

### Task 4: Sync the Rollout Docs and Verify the Approved 2.0 Shape

**Files:**
- Modify: `docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md`
- Modify: `docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md`
- Modify: `docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md`
- Modify if needed: `docs/version2.0/grapesjs-spots-ui-plan.md`
- Reference only: `docs/superpowers/specs/2026-03-18-tabi-2-0-editor-workspace-design.md`

- [x] **Step 1: Update the older rollout documents to point at the approved spec**

Make sure older plans no longer imply:

- block-first editing
- assistant-first handbook-ready UI
- preview-as-main-mode
- CSV from all analyzed spots

- [x] **Step 2: Run the targeted test suite**

Run:

```bash
node --test \
  tests/agent-tool-contracts-2-0.test.mjs \
  tests/handbook-used-spots.test.mjs \
  tests/spots-view-model.test.mjs \
  tests/session-workspace-2-0.test.mjs
```

Expected:

- PASS

- [x] **Step 3: Run repository verification**

Run:

```bash
npm run build
```

Expected:

- PASS

Then run:

```bash
npm run lint
```

Expected:

- PASS

- [ ] **Step 4: Perform a manual smoke of the end-to-end flow**

Verify in the browser:

- analyze session data completes without exposing block editing in the UI
- handbook generation lands in the always-on editor canvas
- right panel defaults to `Edit`
- preview opens from the toolbar action without replacing the center editing canvas
- remix can create another handbook from stored source data
- spots map/list/csv align to used handbook spots

- [ ] **Step 5: Commit the final doc sync and verification-ready state**

```bash
git add docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md \
  docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md \
  docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md \
  docs/version2.0/grapesjs-spots-ui-plan.md
git commit -m "docs: sync rollout plans with approved 2.0 editor workspace"
```
