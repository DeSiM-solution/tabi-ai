# Tabi 2.0 Unified Workspace Rollout Implementation Plan

> Status update (2026-03-18): This document is superseded by:
> - `docs/superpowers/specs/2026-03-18-tabi-2-0-editor-workspace-design.md`
> - `docs/superpowers/plans/2026-03-18-tabi-2-0-editor-workspace-rollout.md`
>
> Active 2.0 product contract:
> - right workspace tabs are `Edit / Spots / Remix`
> - center workspace is handbook edit-first (always-on GrapesJS editing surface once handbook exists)
> - block/session editing modules are not part of visible 2.0 workspace UX
> - Spots map/list/csv are derived from resolved spots actually used by handbook (`used_spot_ids`)
> - `build_travel_blocks` stays compatibility-only and should not be shown as primary 2.0 user-facing semantics

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the current 2.0 migration and upgrade the session studio from handbook-first + raw HTML editing into a design-backed workspace with a GrapesJS-powered visual handbook editor, a right-side Spots workspace, and contextual editing toolbars, without making `Editor Agent + MCP` a prerequisite.

**Architecture:** Keep the current `Session + Handbook + SessionState` data model and treat the already-implemented minimal rollout as the working baseline. First, freeze and verify that baseline end-to-end. Then layer in a client-only GrapesJS editor behind the existing handbook editor save path by translating stored single-file handbook HTML into editor components/CSS and serializing it back on save. Build the right workspace (`LsSX3` / `aTjVS`) as React-controlled UI that listens to GrapesJS selection state and reuses the existing spots/CSV runtime data. In this rollout, the right-side handbook workspace is a manual editing surface, not a working AI conversation/composer. Defer AI-driven edit execution, GrapesJS-to-MCP wrapping, and component-level MCP mutations; only leave explicit hook points for them.

**Tech Stack:** Next.js App Router, React 19, Zustand, Prisma/Postgres, AI SDK, `grapesjs@0.22.14`, `@react-google-maps/api`, Tailwind CSS, existing handbook/session APIs.

---

## References and Status

This plan supersedes the split between:

- [`docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md`](/Users/jianghai/Desktop/ai-next/docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md)
- [`docs/version2.0/grapesjs-spots-ui-plan.md`](/Users/jianghai/Desktop/ai-next/docs/version2.0/grapesjs-spots-ui-plan.md)

Use these companion notes while executing the relevant chunks:

- [`docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md`](/Users/jianghai/Desktop/ai-next/docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md)
- [`docs/version2.0/grapesjs-html-editing-architecture.md`](/Users/jianghai/Desktop/ai-next/docs/version2.0/grapesjs-html-editing-architecture.md)

Execution rule:

- this file is the primary rollout and sequencing document
- companion docs provide chunk-level UI/technical constraints, not parallel rollout tracks
- if a companion doc diverges from this file, follow this file first and then update the companion to match

Current codebase status at the moment this plan is written:

- [x] Generation vs Remix semantics are already implemented.
- [x] Handbook-first center workspace is already implemented.
- [x] Basic manual handbook save/reset/discard flow is already implemented.
- [x] Handbook provenance guards (`generationKind`, `styleAtGeneration`, `manualEditApplied`) are already implemented.
- [x] `npm run lint` exits `0`.
- [x] `npm run build` exits `0`.
- [ ] Manual smoke for the current minimal rollout is still pending.
- [x] GrapesJS visual editor shell is implemented with handbook HTML round-trip saving.
- [x] Right-side Spots workspace matching `aTjVS` is implemented.
- [x] Assistant workspace now follows the `ZA6gt` / `rLNTk` split between edit state and processing state.
- [x] `session analysis` is now persisted in `SessionState.context` / `Handbook.sourceContext`, with legacy `blocks / spotBlocks` retained only as compatibility caches.
☑️ `KREOj` and `saEP6` floating toolbars are implemented in the GrapesJS visual editor. Manual smoke is still pending.

## Scope

### In Scope

- Finish and freeze the current minimal rollout with manual smoke verification.
- Replace the current handbook source-only editor with a visual-first GrapesJS editor.
- Keep handbook saving through the existing `PATCH /api/sessions/[id]/handbooks/[handbookId]` flow.
- Add a right-side workspace shell that matches the product model:
  - `Assistant`
  - `Spots`
  - `Remix`
- Make the handbook-side workspace a **manual** editing inspector in this rollout:
  - spacing controls
  - typography controls
  - lightweight contextual toolbars
- Add a `Spots` tab with:
  - Google-style mini map
  - Open Maps
  - Download CSV
  - spots list
- Add `KREOj` as the first contextual text toolbar.
- Add a limited `saEP6` scaffold for component-level manual actions.
- Preserve current publish / preview / open-in-new-tab behavior.

### Out of Scope

- Full `Editor Agent` implementation.
- Functional AI composer/chat editing UI inside the right workspace.
- Wrapping GrapesJS APIs behind an MCP for Edit Agent usage.
- Component-level MCP mutation backend.
- Replacing the internal compatibility cache with a new schema.
- Prisma migrations for this rollout.
- Broad test framework introduction.
- Full parity with the commercial GrapesJS Studio SDK.

## Constraints To Preserve

- **No Prisma migration in this rollout** unless a blocker is discovered and reviewed first.
- **Do not delete `SessionState.blocks / spotBlocks / toolOutputs`.** They remain the compatibility runtime cache for generation, remix, and spots export continuity.
- **Do not make Edit Agent a prerequisite** for handbook editing.
- **Treat this rollout as manual editing first.** AI composer and Edit Agent integration remain future work.
- **Keep the current handbook save contract stable.** `Handbook.html` remains the persisted artifact.
- **Do not regress the existing minimal rollout while landing the new UI.**

## Testing Strategy

This repository does **not** currently have a dedicated UI/unit test framework for these flows, and broad test framework introduction is explicitly out of scope. For this plan:

- Prefer extracting pure helpers into small files that are easy to reason about.
- Use targeted `eslint` checks on changed files while implementing each chunk.
- Use `npm run lint` and `npm run build` as required verification gates.
- Use manual smoke testing for interaction-heavy flows:
  - generation
  - remix
  - visual editing
  - spots map/CSV
  - publish/open-in-new-tab

## File Map

### Existing Core Files

- `src/app/session/[id]/page.tsx`
  - Main route-level orchestrator for the session studio.
- `src/app/session/[id]/_components/session-html-panel.tsx`
  - Center handbook preview/editor container and version chrome.
- `src/app/session/[id]/_components/handbook-manual-editor.tsx`
  - Current source-mode handbook editor shell; should evolve into a dual-mode editor shell.
- `src/app/session/[id]/_hooks/use-handbook-manual-editor.ts`
  - Save/reset/discard/dirty handling for handbook editing.
- `src/app/session/[id]/_actions/editor-actions.ts`
  - Current CSV export view-model builder and editor persistence helpers.
- `src/app/session/[id]/_stores/session-editor-store.ts`
  - Session-scoped UI state for handbook/editor/preview.
- `src/server/sessions.ts`
  - Server-side handbook persistence and provenance merge behavior.
- `src/components/csv-export-guide-dialog.tsx`
  - Current modal-oriented CSV export UI; likely becomes fallback/help UI instead of the primary spots surface.

### Planned New Files

- `src/app/session/[id]/_components/handbook-visual-editor.tsx`
  - Client-only GrapesJS canvas wrapper.
- `src/app/session/[id]/_hooks/use-grapesjs-editor.ts`
  - GrapesJS lifecycle, event binding, and editor command wiring.
- `src/app/session/[id]/_lib/handbook-html-adapter.ts`
  - Convert stored single-file handbook HTML into editor input and rebuild it on save.
- `src/app/session/[id]/_components/handbook-workspace-panel.tsx`
  - Right-side workspace shell matching `LsSX3`.
- `src/app/session/[id]/_components/session-spots-panel.tsx`
  - `Spots` tab body matching `aTjVS`.
- `src/app/session/[id]/_components/spots-mini-map.tsx`
  - Google Maps mini map for spots markers.
- `src/app/session/[id]/_lib/spots-view-model.ts`
  - Resolve spots rows/markers/open-maps/csv data from current editor/session state.
- `src/app/session/[id]/_components/handbook-text-toolbar.tsx`
  - Floating text toolbar matching `KREOj`.
- `src/app/session/[id]/_components/handbook-block-toolbar.tsx`
  - Limited component-level toolbar scaffold matching `saEP6`.
- `src/app/session/[id]/_lib/handbook-selection.ts`
  - Shared selection metadata types and helpers between the visual editor and floating toolbars.

## Chunk 0: Freeze the Current Minimal Rollout Baseline

### Task 0: Finish Manual Smoke and Lock a Stable Starting Point

**Files:**
- Review: `docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md`
- Review: `src/app/session/[id]/page.tsx`
- Review: `src/app/session/[id]/_components/session-html-panel.tsx`
- Review: `src/app/session/[id]/_components/handbook-manual-editor.tsx`
- Review: `src/app/session/[id]/_actions/editor-actions.ts`
- Modify only if smoke reveals regressions: exact touched files from the list above

- [ ] **Step 1: Run the local app and open at least one session with handbook data**

Run: `npm run dev`
Expected: the session page loads and existing handbook content renders.

- [ ] **Step 2: Manually verify the current minimal rollout checklist**

Verify:
- initial generation creates a handbook and activates it
- remix creates a second handbook and activates it
- handbook switcher still works
- manual handbook edit persists after reload
- publish / open-in-new-tab still work
- CSV export still works
- legacy block editor path still functions when explicitly invoked

- [ ] **Step 3: If smoke reveals a bug, patch the smallest possible fix in the affected file**

Keep fixes scoped to baseline regressions only. Do not start the GrapesJS/Spots work in this chunk.

- [ ] **Step 4: Re-run verification after any baseline fix**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 5: Commit the frozen baseline**

```bash
git add src/app/session/[id]/page.tsx \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/_components/handbook-manual-editor.tsx \
  src/app/session/[id]/_actions/editor-actions.ts \
  docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md
git commit -m "chore: freeze tabi 2.0 minimal rollout baseline"
```

## Chunk 1: GrapesJS Visual Editor Foundation

### Task 1: Add a Dual-Mode Handbook Editor Without Changing the Save Contract

**Files:**
- Create: `src/app/session/[id]/_components/handbook-visual-editor.tsx`
- Create: `src/app/session/[id]/_hooks/use-grapesjs-editor.ts`
- Create: `src/app/session/[id]/_lib/handbook-html-adapter.ts`
- Modify: `src/app/session/[id]/_components/handbook-manual-editor.tsx`
- Modify: `src/app/session/[id]/_hooks/use-handbook-manual-editor.ts`
- Modify: `src/app/session/[id]/_components/session-html-panel.tsx`
- Modify: `src/app/session/[id]/page.tsx`
- Modify if needed: `src/app/session/[id]/_lib/handbook-api.ts`

- [ ] **Step 1: Add a focused handbook HTML adapter layer**

In `src/app/session/[id]/_lib/handbook-html-adapter.ts`, implement helpers with clear responsibilities:

Use [`docs/version2.0/grapesjs-html-editing-architecture.md`](/Users/jianghai/Desktop/ai-next/docs/version2.0/grapesjs-html-editing-architecture.md) as the contract for what belongs to the editor canvas vs what must remain in the preserved handbook document shell.

- `extractHandbookEditorInput(html)`
  - parse the stored single-file handbook HTML
  - extract body HTML
  - extract CSS from `<style>` tags
  - retain title/metadata needed to rebuild the document
- `buildHandbookHtml(editorOutput)`
  - combine exported GrapesJS HTML + CSS back into the stored handbook shell

- [ ] **Step 2: Verify the adapter against real handbook HTML shapes from the app**

Use existing handbook HTML from the session page flow and confirm the adapter can round-trip the current stored document shape without dropping the document shell.

Explicitly verify:

- the preserved outer shell still keeps the expected `<html>`, `<head>`, metadata, and non-editor document structure
- the editable body/canvas content is extracted cleanly for GrapesJS
- CSS from the stored handbook round-trips through extract -> editor -> rebuild without disappearing
- unsupported or script-heavy handbook content still preserves an internal fallback path instead of breaking the visual editor save chain

- [ ] **Step 3: Add a client-only GrapesJS lifecycle hook**

In `src/app/session/[id]/_hooks/use-grapesjs-editor.ts`:

- dynamically load `grapesjs`
- initialize/destroy the editor safely
- expose:
  - editor ready state
  - current dirty state
  - current selected component metadata
  - export helpers for html/css

- [ ] **Step 4: Create the GrapesJS canvas wrapper**

In `src/app/session/[id]/_components/handbook-visual-editor.tsx`:

- render the canvas host container
- initialize GrapesJS only on the client
- disable default panels/storage UI that we do not want
- load components/CSS from the adapter output
- emit selection/change events upward

- [ ] **Step 5: Upgrade the current manual editor shell into a visual-first editor**

In `src/app/session/[id]/_components/handbook-manual-editor.tsx`:

- expose only the GrapesJS-powered `visual` editor to end users
- keep any source fallback internal to failure/recovery flows instead of as a visible mode switch
- replace the old textarea-first shell with the visual canvas container

- [ ] **Step 6: Keep the existing save contract stable**

In `src/app/session/[id]/_hooks/use-handbook-manual-editor.ts` and `src/app/session/[id]/page.tsx`:

- saving from the visual editor serializes GrapesJS output through the adapter and PATCHes the rebuilt HTML
- if an internal fallback path is used later, it must still PATCH the same `html` artifact
- `manualEditApplied` provenance must still be written

- [ ] **Step 7: Keep internal fallback available without exposing raw HTML editing as the primary UI**

If GrapesJS initialization fails or the stored handbook HTML cannot be adapted cleanly:

- show a clear fallback state
- keep the stored handbook artifact intact
- avoid exposing raw HTML editing as the primary user-facing recovery path in 2.0

- [ ] **Step 8: Run targeted verification for the visual editor foundation**

Run:

```bash
npm run lint -- 'src/app/session/[id]/_components/handbook-manual-editor.tsx' \
  'src/app/session/[id]/_components/handbook-visual-editor.tsx' \
  'src/app/session/[id]/_hooks/use-grapesjs-editor.ts' \
  'src/app/session/[id]/_hooks/use-handbook-manual-editor.ts' \
  'src/app/session/[id]/_components/session-html-panel.tsx' \
  'src/app/session/[id]/page.tsx' \
  'src/app/session/[id]/_lib/handbook-html-adapter.ts'
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 9: Manual smoke the visual-first editor**

Verify:
- visual mode loads the current handbook
- a small visual edit saves successfully
- reload shows the saved result
- switching handbook with unsaved edits still behaves safely

- [ ] **Step 10: Commit the visual editor foundation**

```bash
git add src/app/session/[id]/_components/handbook-visual-editor.tsx \
  src/app/session/[id]/_hooks/use-grapesjs-editor.ts \
  src/app/session/[id]/_lib/handbook-html-adapter.ts \
  src/app/session/[id]/_components/handbook-manual-editor.tsx \
  src/app/session/[id]/_hooks/use-handbook-manual-editor.ts \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/page.tsx \
  src/app/session/[id]/_lib/handbook-api.ts
git commit -m "feat: add grapesjs visual handbook editor shell"
```

## Chunk 2: Right Workspace Shell and Spots Tab

### Task 2: Match `LsSX3` / `aTjVS` with a React-Controlled Workspace

Before implementing the map/CSV portions of this task, read and follow the companion note:

- [`docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md`](/Users/jianghai/Desktop/ai-next/docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md)

**Files:**
- Create: `src/app/session/[id]/_components/handbook-workspace-panel.tsx`
- Create: `src/app/session/[id]/_components/session-spots-panel.tsx`
- Create: `src/app/session/[id]/_components/spots-mini-map.tsx`
- Create: `src/app/session/[id]/_lib/spots-view-model.ts`
- Modify: `src/app/session/[id]/_components/session-html-panel.tsx`
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/app/session/[id]/_actions/editor-actions.ts`
- Modify if needed: `src/components/csv-export-guide-dialog.tsx`

- [ ] **Step 1: Add a dedicated spots view-model helper**

In `src/app/session/[id]/_lib/spots-view-model.ts`, build helpers that derive:

- ordered display rows
- `mappableItems`
- `unresolvedItems`
- csv content
- download filename
- open maps URL

Input priority should be:

1. current editor session output
2. active handbook source data
3. session compatibility cache

Keep ordering consistent across:

- map marker rendering
- list rendering
- `Open Maps`
- `Download CSV`

The runtime map must consume the structured view-model, not `csvContent`.

- [ ] **Step 2: Create the Google Maps mini map component**

In `src/app/session/[id]/_components/spots-mini-map.tsx`:

- use `@react-google-maps/api`
- load the map with `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- render spot markers from `mappableItems`
- auto-fit bounds
- keep the map read-only in this rollout
- gracefully handle:
  - missing API key
  - no coordinates

- [ ] **Step 3: Create the `Spots` panel body**

In `src/app/session/[id]/_components/session-spots-panel.tsx`:

- render the mini map
- render `Open Maps`
- render `Download CSV`
- render the spots list sorted by appearance order
- keep `Open Maps` semantics tied to the current route/map URL
- keep `Download CSV` semantics tied to file export for My Maps manual import or downstream use, not in-app auto-import

- [ ] **Step 4: Create the workspace shell matching `LsSX3`**

In `src/app/session/[id]/_components/handbook-workspace-panel.tsx`:

- header with status text
- tabs for:
  - `Assistant`
  - `Spots`
  - `Remix`
- body that swaps tab content
- keep the first `Assistant` body as a **manual editing panel**, not a working AI chat/composer
- expose manual style sectors through React controls backed by GrapesJS selection/style APIs:
  - `Space`: `margin`, `padding`
  - `Typography`: `font-family`, `font-size`, `font-weight`, `font-style`, `color`, `line-height`, `letter-spacing`, `text-align`, `vertical-align`
  - `Decoration`: `background-color`, `border-radius`, `border`, `box-shadow`
- show `vertical-align` only for compatible targets instead of every selected block/section

Keep the first `Assistant` body simple and React-controlled; do not try to use GrapesJS default style panels as the UI shell or ship a real AI composer in this chunk.

- [ ] **Step 5: Wire the workspace shell into the session page**

In `src/app/session/[id]/page.tsx` and `src/app/session/[id]/_components/session-html-panel.tsx`:

- render the workspace shell beside the handbook canvas
- connect current editor/selection/session state into the workspace
- keep preview/publish/version controls intact

- [ ] **Step 6: Move CSV behavior from modal-first to panel-first**

Use the `Spots` tab as the primary UI surface for:

- open maps
- download csv
- list preview

Keep `src/components/csv-export-guide-dialog.tsx` only if a fallback/help surface is still useful after the panel is added.

Do not introduce copy or behavior that implies the app uploads CSV into Google Maps automatically.

- [ ] **Step 7: Run targeted verification for the workspace shell**

Run:

```bash
npm run lint -- 'src/app/session/[id]/_components/handbook-workspace-panel.tsx' \
  'src/app/session/[id]/_components/session-spots-panel.tsx' \
  'src/app/session/[id]/_components/spots-mini-map.tsx' \
  'src/app/session/[id]/_lib/spots-view-model.ts' \
  'src/app/session/[id]/_components/session-html-panel.tsx' \
  'src/app/session/[id]/page.tsx' \
  'src/app/session/[id]/_actions/editor-actions.ts' \
  'src/components/csv-export-guide-dialog.tsx'
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 8: Manual smoke the `Spots` tab**

Verify:
- the tab is visible in the right workspace
- the mini map renders when coordinates exist
- missing coordinates produce a graceful empty/fallback state
- mixed resolved/unresolved spots still show all list items while only mapped items appear on the map
- missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` does not break the spots list or CSV action
- `Open Maps` opens the current route/map URL
- `Download CSV` downloads the expected file directly from the panel for manual import/downstream use
- the displayed list order matches the intended appearance order

- [ ] **Step 9: Commit the workspace shell and spots tab**

```bash
git add src/app/session/[id]/_components/handbook-workspace-panel.tsx \
  src/app/session/[id]/_components/session-spots-panel.tsx \
  src/app/session/[id]/_components/spots-mini-map.tsx \
  src/app/session/[id]/_lib/spots-view-model.ts \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/page.tsx \
  src/app/session/[id]/_actions/editor-actions.ts \
  src/components/csv-export-guide-dialog.tsx
git commit -m "feat: add spots workspace panel"
```

## Chunk 3: Text Selection Toolbar (`KREOj`)

### Task 3: Add the First Contextual Toolbar for Text Editing

**Files:**
- Create: `src/app/session/[id]/_components/handbook-text-toolbar.tsx`
- Create: `src/app/session/[id]/_lib/handbook-selection.ts`
- Modify: `src/app/session/[id]/_hooks/use-grapesjs-editor.ts`
- Modify: `src/app/session/[id]/_components/handbook-visual-editor.tsx`
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/app/session/[id]/_components/session-html-panel.tsx`

☑️ **Step 1: Define a shared selection metadata model**

In `src/app/session/[id]/_lib/handbook-selection.ts`, add types/helpers for:

- selected component id
- component tag/type
- text-editable status
- bounding rect / anchor position
- parent selection info

☑️ **Step 2: Emit selection metadata from the GrapesJS wrapper**

In `src/app/session/[id]/_hooks/use-grapesjs-editor.ts` and `src/app/session/[id]/_components/handbook-visual-editor.tsx`:

- listen to editor/component selection events
- detect when the active selection should show a text toolbar
- publish stable selection metadata upward

☑️ **Step 3: Build the floating text toolbar UI**

In `src/app/session/[id]/_components/handbook-text-toolbar.tsx`, match the `KREOj` shape closely enough to establish the product model:

- bold
- italic
- underline
- strike
- link
- color
- font size

Leave image/text-style actions disabled if they are not wired in the first pass.

☑️ **Step 4: Wire the first manual text commands**

Use GrapesJS editor/component APIs to support:

- bold
- italic
- underline / strike
- link assignment
- color update
- font size update

Do not add Edit Agent behavior in this chunk. `font-style`, `line-height`, `letter-spacing`, and `vertical-align` belong in the right-side manual style inspector rather than this first lightweight text toolbar.

- [ ] **Step 5: Keep persistence aligned with the existing handbook save path**

After applying toolbar changes:

- saving the visual editor still serializes back into `Handbook.html`
- reload preserves the formatting edits

☑️ **Step 6: Run targeted verification for the text toolbar**

Run:

```bash
npm run lint -- 'src/app/session/[id]/_components/handbook-text-toolbar.tsx' \
  'src/app/session/[id]/_lib/handbook-selection.ts' \
  'src/app/session/[id]/_hooks/use-grapesjs-editor.ts' \
  'src/app/session/[id]/_components/handbook-visual-editor.tsx' \
  'src/app/session/[id]/_components/session-html-panel.tsx' \
  'src/app/session/[id]/page.tsx'
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 7: Manual smoke the text toolbar**

Verify:
- selecting editable text shows the toolbar
- non-text selections do not show the text toolbar
- bold/italic/color/size/link change the canvas immediately
- save + reload preserves the changes

- [ ] **Step 8: Commit the text toolbar**

```bash
git add src/app/session/[id]/_components/handbook-text-toolbar.tsx \
  src/app/session/[id]/_lib/handbook-selection.ts \
  src/app/session/[id]/_hooks/use-grapesjs-editor.ts \
  src/app/session/[id]/_components/handbook-visual-editor.tsx \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/page.tsx
git commit -m "feat: add handbook text toolbar"
```

## Chunk 4: Component Toolbar Scaffold (`saEP6`)

### Task 4: Add Limited Section-Level Manual Actions and Future Hooks

**Files:**
- Create: `src/app/session/[id]/_components/handbook-block-toolbar.tsx`
- Modify: `src/app/session/[id]/_hooks/use-grapesjs-editor.ts`
- Modify: `src/app/session/[id]/_components/handbook-visual-editor.tsx`
- Modify: `src/app/session/[id]/_lib/handbook-selection.ts`
- Modify: `src/app/session/[id]/page.tsx`
- Modify: `src/app/session/[id]/_components/session-html-panel.tsx`

☑️ **Step 1: Extend selection metadata for section/component actions**

Add enough metadata to support:

- current component id
- current parent id
- can duplicate
- can delete
- can select parent

☑️ **Step 2: Build the `saEP6` toolbar shell**

In `src/app/session/[id]/_components/handbook-block-toolbar.tsx`, render the component toolbar matching the product direction:

- `Ai Commands`
- `Select Parent`
- `Move`
- `Duplicate`
- `Delete`
- heading / color / size affordances

Only wire the actions we are explicitly implementing in this chunk. Keep the rest visually present but disabled.

☑️ **Step 3: Implement only the first safe manual actions**

Wire:

- select parent
- duplicate component/section
- delete component/section

Do not implement:

- AI commands
- heading transformations
- complex drag/reorder behavior

☑️ **Step 4: Leave explicit hook points for future Edit Agent work**

In the visual editor integration layer:

- expose future-safe command hooks for selected component ids
- keep the toolbar/action boundary clear so AI/MCP wiring can attach later without rewriting the UI shell
- design the boundary around the GrapesJS APIs we expect to wrap later:
  - selected component lookup
  - style mutation
  - component duplicate/delete/select-parent
  - asset selection/replacement

☑️ **Step 5: Run targeted verification for the component toolbar scaffold**

Run:

```bash
npm run lint -- 'src/app/session/[id]/_components/handbook-block-toolbar.tsx' \
  'src/app/session/[id]/_hooks/use-grapesjs-editor.ts' \
  'src/app/session/[id]/_components/handbook-visual-editor.tsx' \
  'src/app/session/[id]/_lib/handbook-selection.ts' \
  'src/app/session/[id]/_components/session-html-panel.tsx' \
  'src/app/session/[id]/page.tsx'
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 6: Manual smoke the component toolbar scaffold**

Verify:
- section-level selection shows the toolbar
- duplicate works and is visible immediately
- delete removes the selected block and can still be saved
- select-parent walks upward as expected
- disabled controls remain visually present but inactive

- [ ] **Step 7: Commit the component toolbar scaffold**

```bash
git add src/app/session/[id]/_components/handbook-block-toolbar.tsx \
  src/app/session/[id]/_hooks/use-grapesjs-editor.ts \
  src/app/session/[id]/_components/handbook-visual-editor.tsx \
  src/app/session/[id]/_lib/handbook-selection.ts \
  src/app/session/[id]/_components/session-html-panel.tsx \
  src/app/session/[id]/page.tsx
git commit -m "feat: add handbook block toolbar scaffold"
```

## Chunk 5: Documentation, Final Verification, and Handoff

### Task 5: Align the Docs and Re-verify the Full Studio Flow

**Files:**
- Modify: `docs/chat-flow.md`
- Modify: `docs/process-management.md`
- Modify: `docs/version2.0/README.md`
- Modify: `docs/version2.0/grapesjs-spots-ui-plan.md`
- Modify: `docs/version2.0/grapesjs-html-editing-architecture.md`
- Modify: `docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md`
- Modify: `docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md`
- Modify: `docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md`

- [ ] **Step 1: Update the product/flow docs to reflect the new workspace reality**

Document:

- handbook-first studio remains the core
- GrapesJS is the center canvas engine, not the full Studio shell
- current rollout is manual editing first; AI composer remains future scope
- `Spots` is a first-class workspace tab
- the Spots mini map is powered by structured runtime spot rows, not by parsing exported CSV back into the UI
- `KREOj` is the first contextual toolbar
- `saEP6` is a limited scaffold, not the full Edit Agent

- [ ] **Step 2: Mark plan progress and superseded documents clearly**

Update the older minimal rollout plan and the companion notes so that future readers understand which document is the active execution plan.

- [ ] **Step 3: Run the final verification gates**

Run:

```bash
npm run lint
npm run build
```

Expected: both commands exit `0`.

- [ ] **Step 4: Run the full manual smoke checklist**

Verify all of the following in one pass:

- initial generation creates a handbook and activates it
- remix creates a new handbook artifact and activates it
- handbook switcher still works
- source-mode handbook edit persists after reload
- visual-mode handbook edit persists after reload
- handbook switching still respects dirty-state protection
- `Spots` tab renders a map/list when coordinates exist
- `Open Maps` and `Download CSV` work from the panel
- `KREOj` appears for text selections
- `saEP6` appears for section selections
- publish / open-in-new-tab still work
- legacy block editor fallback still works when explicitly invoked

- [ ] **Step 5: Commit the final docs and verification updates**

```bash
git add docs/chat-flow.md \
  docs/process-management.md \
  docs/version2.0/README.md \
  docs/version2.0/grapesjs-spots-ui-plan.md \
  docs/version2.0/grapesjs-html-editing-architecture.md \
  docs/superpowers/plans/2026-03-17-tabi-2-0-minimal-rollout.md \
  docs/superpowers/plans/2026-03-17-tabi-2-0-spots-google-maps-csv-companion.md \
  docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md
git commit -m "docs: unify tabi 2.0 workspace rollout plan"
```

## Suggested Execution Order

- [ ] Chunk 0
- [x] Chunk 1
- [x] Chunk 2
- [ ] Chunk 3
- [ ] Chunk 4
- [ ] Chunk 5

## Parallelism Guidance

Allowed parallel preparation while another chunk is underway:

- helper extraction files
- view-model files
- documentation drafting
- low-coupling presentational components

Do **not** run these in parallel in separate implementation tracks:

- `src/app/session/[id]/page.tsx`
- `src/app/session/[id]/_components/session-html-panel.tsx`
- `src/app/session/[id]/_components/handbook-manual-editor.tsx`
- `src/app/session/[id]/_hooks/use-grapesjs-editor.ts`

Those files sit on the critical path and should be treated as the single integration spine.

## Stop Conditions

Pause and re-check with the human before proceeding if any of the following becomes true:

- GrapesJS cannot safely round-trip the stored handbook HTML shape without corrupting persisted output
- the new visual editor breaks publish / preview / handbook switching behavior
- the Spots panel requires a schema migration to be trustworthy
- the only way to make editing usable becomes implementing `Editor Agent + MCP` immediately
- the toolbar implementation starts requiring a full rewrite of the session page instead of layered upgrades
