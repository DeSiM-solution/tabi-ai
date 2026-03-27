# Tabi 2.0 Minimal Rollout Implementation Plan

> Status update (2026-03-18): This plan is now historical baseline context.
> Current rollout authority is:
> - `docs/superpowers/specs/2026-03-18-tabi-2-0-editor-workspace-design.md`
> - `docs/superpowers/plans/2026-03-18-tabi-2-0-editor-workspace-rollout.md`
>
> Current 2.0 UX direction:
> - no visible block/session editing modules in workspace
> - handbook editor is visual edit-first in center canvas
> - right tabs are `Edit / Spots / Remix`
> - spots export follows used handbook spots, not all analyzed spots

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the current multi-handbook, block-driven implementation to a 2.0-compatible, session-backed handbook workflow with minimal database changes: keep the existing pipeline and storage model, relabel first-generation vs remix semantics, default the UI to handbook-first, and ship basic manual handbook editing while deferring the future `Editor Agent + MCP` work.

**Architecture:** Reuse the existing `Handbook` table as the durable artifact for both initial generation and remix outputs, and keep `SessionState.context/blocks/spotBlocks/toolOutputs` as the compatibility runtime cache for the current pipeline. Do not introduce a Prisma migration in the first pass; instead, shift product semantics, toolbar flows, and editing defaults around the existing `Handbook + SessionState` structure, then add a minimal handbook editor that writes back to `Handbook.html` through the existing PATCH API.

**Tech Stack:** Next.js App Router, React 19, Zustand, Prisma/Postgres, AI SDK, existing handbook/session APIs, current block pipeline, existing `grapesjs` dependency for basic manual editing only.

---

## Scope

### In Scope

- Reframe the current pipeline as `Generation` vs `Remix` without changing the underlying tool chain yet.
- Keep the existing Prisma schema stable in the first pass.
- Make the center workspace handbook-first by default.
- Keep block editing as a compatibility path instead of the primary user path.
- Add a minimal manual handbook editing path that persists to `Handbook.html`.
- Preserve current spots / CSV behavior.

### Out of Scope

- Full `Editor Agent` implementation.
- Component-level MCP actions (`component.setStyle()`, etc.).
- Replacing the internal block pipeline with a new non-block internal schema.
- Large visual redesign of the whole session page.
- Broad testing framework introduction.

## Context Already Verified

- [x] Read [`docs/chat-flow.md`](/Users/jianghai/Desktop/ai-next/docs/chat-flow.md) and confirmed the current 2.0 orchestration is `parse -> crawl -> analyze_session_data -> resolve_spot_coordinates -> image -> generate_handbook_html`, while persistence still keeps `build_travel_blocks` as the compatibility key.
- [x] Read [`docs/process-management.md`](/Users/jianghai/Desktop/ai-next/docs/process-management.md) and confirmed the current production shape is already `Session + Handbook + SessionState`.
- [x] Read [`prisma/schema.prisma`](/Users/jianghai/Desktop/ai-next/prisma/schema.prisma) and confirmed `Handbook` already stores `html/style/sourceContext/sourceBlocks/sourceSpotBlocks/sourceToolOutputs`.
- [x] Queried the current remote database read-only and confirmed:
  - `Session`, `Handbook`, and `SessionState` are all live.
  - Sessions with multiple handbooks already exist.
  - `SessionState.handbookHtml` is mostly unused, while `blocks/spotBlocks/toolOutputs` are still active.
  - Recent handbooks already persist `style` and `source*` fields.
- [x] Confirmed the current UI is still `blocks/html` dual-mode and that manual editing currently exists only in the block editor, not in the handbook canvas.
- [x] Confirmed the API already supports `PATCH /api/sessions/[id]/handbooks/[handbookId]` with direct `html` updates, so the first-pass handbook editor does not require a schema change.

## Constraints To Preserve

- **No Prisma migration in the first pass** unless a blocker is found during implementation.
- **Do not delete block persistence yet.** `SessionState.blocks/spotBlocks/toolOutputs` remain the compatibility layer for generation and remix.
- **Do not make the future Editor Agent a prerequisite** for the current rollout.
- **Ship handbook-first behavior first,** but keep the block path available as a fallback for generation/remix until the new editing flow is stable.

## Chunk 1: Generation / Remix Semantics

### Task 1: Reframe the Current Pipeline as Generation + Remix

**Files:**
- Modify: `src/agent/chat.ts`
- Modify: `src/app/session/[id]/_actions/handbook-actions.ts`
- Modify: `src/app/session/[id]/_lib/session-page-constants.ts`
- Modify: `src/app/session/[id]/_lib/handbook-utils.ts`
- Modify: `src/app/session/[id]/page.tsx`

- [x] **Step 1: Replace user-facing "manual handbook regen from edited blocks" wording with remix semantics**

Keep the internal compatibility behavior, but change the product-language path from:

```text
Generate handbook HTML from edited blocks.
```

to a remix-oriented command path and UI copy. Keep the legacy prefix accepted temporarily so old sessions and existing flows do not break.

- [x] **Step 2: Keep the orchestration implementation compatible**

Do **not** remove the current `handbook_regen` behavior in `src/agent/chat.ts` yet. Instead:

- keep the existing tool gate logic
- keep using latest runtime/session state
- reinterpret it as the current `Remix Agent` execution path

- [x] **Step 3: Ensure remix still creates a new handbook artifact**

When remix runs from the current editor flow:

- it must still create a new `Handbook`
- it must still update `Session.activeHandbookId`
- it must not overwrite the current active handbook in place

- [x] **Step 4: Persist a minimal generation-kind marker without changing schema**

Use existing JSON fields only, for example `Handbook.sourceContext`, to record a lightweight marker such as:

```json
{ "generationKind": "initial" | "remix" }
```

This is enough for UI / debugging / future rollout work and avoids a migration.

- [ ] **Step 5: Verify the current DB shape still works after the semantic shift**

Manual verification target:

- an initial generation still lands a `Handbook`
- a remix still lands another `Handbook`
- `activeHandbookId` still switches
- existing sessions still load

- [ ] **Step 6: Commit**

```bash
git add src/agent/chat.ts \
  src/app/session/[id]/_actions/handbook-actions.ts \
  src/app/session/[id]/_lib/session-page-constants.ts \
  src/app/session/[id]/_lib/handbook-utils.ts \
  src/app/session/[id]/page.tsx
git commit -m "feat: reframe handbook regen as remix"
```

## Chunk 2: Handbook-First Workspace

### Task 2: Make the Center Workspace Handbook-First by Default

**Files:**
- Modify: `src/app/session/[id]/layout.tsx`
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/app/session/[id]/_stores/session-editor-store.ts`
- Modify: `src/app/session/[id]/_components/session-html-panel.tsx`
- Modify: `src/app/session/[id]/_components/handbook-version-menu.tsx`
- Modify: `src/app/session/[id]/_actions/handbook-version-actions.ts`

- [x] **Step 1: Change the default center view to handbook-first**

Current state:

- store default: `centerViewMode = 'blocks'`
- toolbar treats `Blocks` as a first-class center mode

Target:

- sessions with available handbook HTML should default to `html`
- sessions without handbook HTML may still fall back to `blocks`

- [x] **Step 2: Re-label version UI as handbook/remix UI**

Update copy that still implies "version" as the primary mental model:

- version menu labels
- generating placeholder wording where appropriate
- selection / action copy in the handbook toolbar

Keep the underlying multi-handbook implementation intact.

- [x] **Step 3: Keep the block editor reachable as a compatibility path, not the primary path**

Do **not** delete block editor code in this pass. Instead:

- keep "Edit blocks" entry points working
- avoid defaulting the user into the block workspace
- keep block-mode actions available only where still needed

- [x] **Step 4: Move the remix action onto the handbook-first path**

The current toolbar only exposes the main remix/generate action on the block side. Rework this so remix can be triggered while the user is in the handbook-first flow.

- [ ] **Step 5: Manual smoke the center workspace**

Verify:

- session opens into handbook-first mode when HTML exists
- active handbook selection still works
- preview device toggle still works
- publish / open-in-new-tab still work
- legacy block fallback is still available

- [ ] **Step 6: Commit**

```bash
git add src/app/session/[id]/layout.tsx \
  src/app/session/[id]/page.tsx \
  src/app/session/[id]/_stores/session-editor-store.ts \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/_components/handbook-version-menu.tsx \
  src/app/session/[id]/_actions/handbook-version-actions.ts
git commit -m "feat: make session workspace handbook-first"
```

## Chunk 3: Basic Manual Handbook Editing

### Task 3: Ship Manual Handbook Editing Without the Future Editor Agent

**Files:**
- Create: `src/app/session/[id]/_components/handbook-manual-editor.tsx`
- Create: `src/app/session/[id]/_lib/handbook-api.ts`
- Create: `src/app/session/[id]/_hooks/use-handbook-manual-editor.ts`
- Modify: `src/app/session/[id]/_components/session-html-panel.tsx`
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/app/session/[id]/layout.tsx`
- Modify: `src/stores/handbooks-store.ts`

- [x] **Step 1: Add a minimal handbook editor surface on top of the active handbook**

Use the existing `grapesjs` dependency for the smallest viable editor path:

- load the active handbook HTML
- allow direct manual edits
- no agent orchestration
- no MCP integration

If GrapesJS proves too large for the first pass, fall back to a tightly scoped HTML-edit + preview split, but keep the public API of the new editor wrapper file stable so GrapesJS can be swapped back in.

- [x] **Step 2: Persist edited handbook HTML to the existing handbook PATCH route**

Use the already-supported route:

```text
PATCH /api/sessions/[id]/handbooks/[handbookId]
```

Persist only handbook-level editable fields in this pass:

- `html`
- optional `title` if edited there
- optional `previewPath` if the client flow needs it

Do **not** overwrite `sourceBlocks/sourceSpotBlocks/sourceToolOutputs` on manual save.

- [x] **Step 3: Add local dirty-state / save / reset handling**

The manual editor needs:

- dirty-state tracking
- explicit save action
- reset/discard back to persisted HTML
- active handbook switching safety

- [x] **Step 4: Keep future Editor Agent integration paths open**

The first-pass manual editor must not hardcode itself into a dead end. Preserve these future hooks:

- stable handbook / active-handbook references
- a future component-selection surface
- a future slot for component ids or DOM anchors

Do **not** implement the agent in this pass.

- [ ] **Step 5: Manual smoke the new editing path**

Required manual checks:

- open an existing handbook
- edit content in the handbook area
- save changes
- reload the page
- confirm the saved handbook HTML persists
- switch to another handbook and back
- confirm active handbook selection still behaves correctly

- [ ] **Step 6: Commit**

```bash
git add src/app/session/[id]/_components/handbook-manual-editor.tsx \
  src/app/session/[id]/_lib/handbook-api.ts \
  src/app/session/[id]/_hooks/use-handbook-manual-editor.ts \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/page.tsx \
  src/app/session/[id]/layout.tsx \
  src/stores/handbooks-store.ts
git commit -m "feat: add basic manual handbook editing"
```

## Chunk 4: Data Compatibility and Remix Quality Guardrails

### Task 4: Preserve Existing Runtime Data While Improving Remix Inputs

**Files:**
- Modify: `src/agent/tools/generate-handbook-html.ts`
- Modify: `src/agent/context/persistence.ts`
- Modify: `src/server/sessions.ts`
- Modify: `src/app/session/[id]/_actions/editor-actions.ts`

- [x] **Step 1: Ensure every generated/remixed handbook has complete source payloads**

For newly created handbook rows, ensure the following remain populated wherever possible:

- `sourceContext`
- `sourceBlocks`
- `sourceSpotBlocks`
- `sourceToolOutputs`
- `style`
- `thumbnailUrl`

- [x] **Step 2: Keep `SessionState` as the compatibility cache**

Do **not** remove or migrate:

- `SessionState.blocks`
- `SessionState.spotBlocks`
- `SessionState.toolOutputs`

This first pass depends on them for generation/remix continuity.

- [x] **Step 3: Avoid destroying future remix variance on manual save**

Manual handbook editing must update the current handbook artifact, but it must **not** flatten or erase the compatibility data used by remix.

Specifically:

- editing handbook HTML should not wipe source data
- remix should continue to use existing stored source material

- [x] **Step 4: Add lightweight provenance markers using existing JSON**

Without a schema change, store minimal provenance hints in `sourceContext`, such as:

- `generationKind`
- `styleAtGeneration`
- `manualEditApplied: true` when relevant

This helps future rollout work without changing Prisma.

- [ ] **Step 5: Verify with current real-world data shapes**

Verify against the already-observed DB reality:

- sessions with multiple handbooks still load
- sessions with `SessionState.blocks/spotBlocks/toolOutputs` still remix
- handbooks with older rows and null `previewPath` still preview

- [ ] **Step 6: Commit**

```bash
git add src/agent/tools/generate-handbook-html.ts \
  src/agent/context/persistence.ts \
  src/server/sessions.ts \
  src/app/session/[id]/_actions/editor-actions.ts
git commit -m "feat: preserve remix source data and provenance"
```

## Chunk 5: Verification and Documentation

### Task 5: Verify the Rollout and Update the Handoff Docs

**Files:**
- Modify: `docs/chat-flow.md`
- Modify: `docs/process-management.md`

- [x] **Step 1: Update `docs/chat-flow.md`**

Reflect the new minimal 2.0 semantics:

- generation vs remix wording
- handbook-first center workspace
- block editing as compatibility path
- manual handbook editing path

- [x] **Step 2: Update `docs/process-management.md`**

Reflect:

- no-schema-change first pass
- handbook PATCH-based manual editing
- current/future boundary for `Editor Agent`

- [x] **Step 3: Run lint**

Current status: `npm run lint` now exits `0`. The two hook errors in `src/app/session/[id]/_hooks/use-html-preview-loading.ts` and `src/app/session/[id]/_hooks/use-unsaved-guard.ts` were fixed during rollout work. `.vibma/plugin-v0.3.2/code.js` still emits warnings only.

Run:

```bash
npm run lint
```

Expected: exit code `0`

- [x] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: exit code `0`

- [ ] **Step 5: Run the manual smoke checklist**

Required smoke checklist:

- initial generation creates a handbook and activates it
- remix creates a second handbook and activates it
- handbook switcher still works
- manual handbook edit persists after reload
- CSV export still works
- legacy block editor path still functions when explicitly invoked

- [ ] **Step 6: Commit**

```bash
git add docs/chat-flow.md docs/process-management.md
git commit -m "docs: update flow docs for minimal 2.0 rollout"
```

## Suggested Execution Order

- [ ] Chunk 1
- [ ] Chunk 2
- [ ] Chunk 3
- [ ] Chunk 4
- [ ] Chunk 5

## Stop Conditions

Pause and re-check with the human before proceeding if any of the following becomes true:

- a Prisma migration becomes necessary for the first pass
- manual handbook editing cannot be added without breaking active handbook switching
- remix still depends on wiping or overwriting the current active handbook
- the only viable path for manual editing becomes "full Editor Agent + MCP"
