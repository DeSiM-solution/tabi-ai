# Tabi 2.0 Spots Google Maps + CSV Companion Plan

> Status update (2026-03-18): Companion assumptions are now governed by:
> - `docs/superpowers/specs/2026-03-18-tabi-2-0-editor-workspace-design.md`
> - `docs/superpowers/plans/2026-03-18-tabi-2-0-editor-workspace-rollout.md`
>
> Active Spots contract in current rollout:
> - Spots workspace is the right-panel `Spots` tab (with `Edit / Spots / Remix` shell)
> - runtime source is structured resolved spots filtered by `used_spot_ids`
> - CSV is an export artifact generated from the same used+resolved ordering as map/list
> - CSV is not a runtime source for map rendering

> Companion to `docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md`, especially Chunk 2 (`LsSX3` / `aTjVS`).
>
> This is a Chunk 2 implementation companion, not a separate top-level rollout plan. If this note and the unified rollout plan ever disagree on sequencing or scope, follow the unified rollout plan first and then update this companion to match.

**Goal:** Define how the `Spots` workspace should render map data in the React session studio, how CSV should be generated and downloaded, and which Google Maps SDK path best fits the current rollout without expanding scope.

**Architecture:** Treat CSV as an export artifact, not as the primary runtime source for map rendering. Build a normalized spots view-model from the existing session/editor outputs, render the mini map and list from that shared structure, and derive `Download CSV` / `Open Maps` behavior from the same source of truth so the panel stays consistent.

**Tech Stack:** Next.js App Router, React 19, `@react-google-maps/api`, Google Maps JavaScript API, existing `buildGoogleMapsCsv(...)` and session output utilities.

---

## Why This Companion Exists

The unified rollout plan already says Chunk 2 should ship a right-side `Spots` workspace with a Google-style mini map, `Open Maps`, `Download CSV`, and a spots list. What it does **not** pin down yet is the technical decision behind "show CSV on Google Maps in a React app."

That decision matters because the Google Maps JavaScript API does not natively consume CSV files as a first-class map overlay format. If we make the wrong assumption here, we will either:

- add avoidable parsing and synchronization complexity,
- couple the map to a download format instead of the underlying structured data, or
- create UX copy that implies My Maps import behavior the product does not actually automate.

This note narrows the implementation choices before Chunk 2 is executed.

## UI Contract from `aTjVS`

The prototype node `aTjVS` in `pencil-demo.pen` establishes a clear panel structure:

- header: `Handbook Workspace` + status text
- tabs: `Assistant`, `Spots`, `Remix`
- map card: `Spots Mini Map (Google-style)`
- action row: `Open Maps` and `Download CSV`
- list section: `CSV Spots Data`
- ordering hint: `Sorted by video appearance time (earliest -> latest)`
- card rows: image, name, tags, and short description

That prototype implies three product rules:

1. The `Spots` tab is a first-class workspace surface, not a modal fallback.
2. Map, list, and CSV actions must reflect the same ordered set of spots.
3. The panel should stay useful even when some spots are missing coordinates.

## Web Research Summary

### What Google Maps JS API accepts directly

- Google Maps JavaScript API provides a `Data` layer for geospatial features and explicitly supports GeoJSON import, including `loadGeoJson(...)` and `addGeoJson(...)`.
- Google Maps documentation does **not** describe CSV as a direct import format for the JavaScript map runtime.
- Practical conclusion: if a product begins with raw CSV, it must first be normalized into JavaScript objects or transformed into GeoJSON before the map can render it.

### What this means in React

- For a small, panel-sized mini map with a limited number of spot markers, rendering markers from normalized React state is simpler than introducing a CSV-driven GeoJSON pipeline.
- The official Google ecosystem now points React users toward `@vis.gl/react-google-maps`, while the current repository already ships with `@react-google-maps/api@^2.20.8`, and the package documentation notes React 19 support in current releases.
- Practical conclusion: for this rollout, keep the existing dependency instead of mixing in a wrapper migration. If the team later wants closer alignment with Google's current React guidance, that can be a separate follow-up.

### Coordinates are the real requirement, not CSV

- If the app already has `lat` / `lng`, map rendering is straightforward.
- If a future CSV source only has names or addresses, the app must geocode those values before it can place markers.
- Practical conclusion: do not design the current panel around parsing download-ready CSV just to rediscover coordinates the app already stores.

### `Open Maps` is different from `Download CSV`

- Google Maps URLs support opening routes and map destinations directly in Google Maps.
- CSV import belongs to a My Maps workflow, which is separate from the normal Maps directions URL flow.
- Practical conclusion: the UI should not imply that `Open Maps` uploads or imports the downloaded CSV automatically. `Open Maps` opens a route/map URL. `Download CSV` prepares a file for manual import or downstream use.

## Repository Reality Check

The current codebase already has most of the data plumbing needed for the panel:

- `src/app/session/[id]/_lib/chat-utils.ts`
  - `buildGoogleMapsCsv(...)`
  - `applyEditorSession(...)`
  - `spot_blocks`
  - `spots_with_coordinates`
- `src/app/session/[id]/_lib/session-output-utils.ts`
  - persisted output fallback resolution
- `src/app/session/[id]/_actions/editor-actions.ts`
  - current CSV export state and `Open Maps` URL generation
- `src/components/csv-export-guide-dialog.tsx`
  - current modal-based fallback UI

Important consequence: the app already has structured spot data before CSV generation happens.

So the question is not "how do we make Google Maps display CSV?" The right question is:

> "Which structured spot model should power the map/list/actions, and when do we serialize that model to CSV?"

## Decision

### Recommended rollout path

Use a shared spots view-model as the only runtime source for:

- mini map markers
- spots list rows
- `Download CSV`
- `Open Maps`
- empty/fallback states

Do **not** make the mini map consume `csvContent`.

### Why this is the best fit

- It matches how Google Maps JS API actually works.
- It reuses the repository's existing `blocks` / `spot_blocks` / `spots_with_coordinates` chain.
- It avoids re-parsing exported CSV inside the same UI that generated it.
- It keeps ordering stable because the current block order already represents appearance order.
- It keeps the rollout scoped to Chunk 2 instead of turning it into a wrapper migration or data ingestion project.

## Approach Comparison

### Approach A: Shared view-model from existing editor/session output

How it works:

- derive normalized spot rows from the current session/editor output,
- render React list items and Google Maps markers from those rows,
- generate CSV from the same rows only when the user downloads.

Pros:

- lowest scope
- aligns with current code
- no duplicate parsing path
- easiest to test and reason about

Cons:

- not a general-purpose CSV ingestion system

Recommendation:

- **Use this for the current rollout.**

### Approach B: Parse runtime CSV in the client and then render markers

How it works:

- create or fetch a CSV string,
- parse it in the browser,
- normalize headers and coordinates,
- render the map from parsed rows.

Pros:

- useful if the product truly starts from user-supplied CSV

Cons:

- adds a second data contract
- duplicates logic the app already has in structured form
- easier for export and render behavior to drift apart

Recommendation:

- Do not use this as the primary path for Chunk 2.
- Keep it as a possible future enhancement if the product later supports CSV upload/import inside the app.

### Approach C: Convert spot rows to GeoJSON and feed the map `Data` layer

How it works:

- normalize spot rows,
- transform them to GeoJSON Features,
- load them into `map.data`.

Pros:

- aligns with Google's documented geospatial import path
- good foundation if future work needs richer GIS styling or shape overlays

Cons:

- unnecessary indirection for a small marker-only panel
- more ceremony than simple marker rendering

Recommendation:

- Reserve this for a future dataset-heavy or overlay-heavy phase, not the current mini map rollout.

## Target Data Contract

Create a focused view-model in `src/app/session/[id]/_lib/spots-view-model.ts`.

Recommended types:

```ts
export type SpotsPanelItem = {
  id: string;
  order: number;
  name: string;
  description: string;
  tags: string[];
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
};

export type SpotsPanelViewModel = {
  items: SpotsPanelItem[];
  mappableItems: SpotsPanelItem[];
  unresolvedItems: SpotsPanelItem[];
  csvContent: string | null;
  csvRowCount: number;
  csvFileName: string | null;
  openMapsUrl: string;
};
```

Source priority should stay aligned with the main rollout plan:

1. current editor session output
2. active handbook source data
3. persisted session compatibility cache

### Ordering rule

Keep the row order identical across:

- map markers
- list cards
- generated CSV rows
- route URL generation

For the current product, "appearance order" should follow block order from the resolved session output unless a later feature introduces explicit timing metadata.

## Rendering Plan

### `spots-view-model.ts`

Responsibilities:

- normalize raw output into ordered `SpotsPanelItem[]`
- attach best-available image URLs when present
- reuse `buildGoogleMapsCsv(...)` where possible instead of reimplementing CSV formatting
- produce `openMapsUrl` from the same ordered coordinate list
- surface missing-coordinate counts for UI fallback copy

### `spots-mini-map.tsx`

Responsibilities:

- load Google Maps JS API using the existing project dependency
- render a bounded mini map for `mappableItems`
- auto-fit bounds when there are 2+ valid points
- center and zoom sensibly when there is 1 valid point
- show a stable empty state when there are no valid coordinates
- show a stable configuration state when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing

Implementation guidance:

- keep map rendering read-only for this rollout
- keep marker rendering behind a small internal adapter because Google Maps is steering new implementations toward Advanced Markers and we may want wrapper flexibility later
- do not block the entire panel on map load failure; the list and CSV actions should still work

### `session-spots-panel.tsx`

Responsibilities:

- render the `aTjVS` layout
- show the mini map card
- show `Open Maps` and `Download CSV`
- show list ordering text
- render ordered spot cards with image, title, tags, and description
- explain when some spots are omitted from the map because coordinates are missing

Copy guidance:

- `Open Maps` should describe opening the current route/map URL
- `Download CSV` should describe exporting the current spots dataset
- any My Maps hint should be labeled as a manual import workflow, not as button behavior

## UX Corrections to Carry into Chunk 2

The current modal-based CSV flow mixes two ideas:

- route opening in Google Maps
- CSV import into Google My Maps

Those are related but not identical. To avoid misleading copy in the new panel:

- keep `Open Maps` wired to the generated route URL
- describe `Download CSV` as a file export for Google My Maps import or downstream processing
- avoid copy that implies the app itself uploads CSV into My Maps

## Failure States

The panel should handle these cases independently:

- no spots at all
  - show empty list/map state and disable both actions
- spots exist but none have coordinates
  - list still renders
  - map shows an explanatory empty state
  - CSV may still download only if the chosen export contract allows blank coordinates; otherwise disable and explain
- some spots have coordinates and some do not
  - map renders only mappable items
  - list renders all items
  - helper text explains that only resolved items appear on the map
- missing Google Maps API key
  - panel keeps the list and CSV action alive
  - map card switches to a non-crashing fallback

For the current repository behavior, keep CSV export gated on valid coordinates so the download remains useful for mapping workflows.

## Implementation Deltas for the Main Rollout Plan

When executing Chunk 2 in the unified rollout plan, interpret the existing tasks this way:

- Step 1 (`spots-view-model.ts`)
  - implement the shared runtime model first
- Step 2 (`spots-mini-map.tsx`)
  - consume `mappableItems`, not `csvContent`
- Step 3 (`session-spots-panel.tsx`)
  - keep action buttons and list bound to the same view-model instance
- Step 6 (panel-first CSV behavior)
  - keep the existing modal only as a fallback/help surface, not as the primary entry point

## Explicit Non-Goals for This Companion

- adding CSV upload/import to the React app
- migrating from `@react-google-maps/api` to `@vis.gl/react-google-maps`
- automating My Maps import
- adding a new backend schema or Prisma migration for map rendering
- introducing GIS-heavy GeoJSON layers for this mini map

## Sources

- Google Maps JavaScript API Data layer:
  - <https://developers.google.com/maps/documentation/javascript/datalayer>
- Google Maps JS API GeoJSON loading example:
  - <https://developers.google.com/maps/documentation/javascript/examples/layer-data-dynamic>
- Google Maps JS API marker migration guidance:
  - <https://developers.google.com/maps/documentation/javascript/advanced-markers/migration>
- Google Maps geocoding example:
  - <https://developers.google.com/maps/documentation/javascript/examples/geocoding-simple>
- Google Maps URLs guide:
  - <https://developers.google.com/maps/documentation/urls/guide>
- `@react-google-maps/api` package page:
  - <https://www.npmjs.com/package/@react-google-maps/api>
- `@vis.gl/react-google-maps` docs:
  - <https://visgl.github.io/react-google-maps/docs>
