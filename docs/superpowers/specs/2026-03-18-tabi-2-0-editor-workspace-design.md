# Tabi 2.0 Editor Workspace Design

## 1. Purpose

This spec locks the intended 2.0 workspace shape before more implementation continues.

The main correction is that Tabi 2.0 is no longer a `Block editor + Handbook preview` product.
It is a `source-data-driven handbook workspace` where:

- crawled and analyzed source data is stored for reuse
- the main user-facing artifact is the handbook HTML
- handbook editing happens directly inside a visual HTML editor
- spots export is derived from structured source data plus what the final handbook actually uses

This spec supersedes any remaining UI or tool behavior that treats `blocks` or `session editor` as first-class user-facing concepts.

## 2. Product Principles

### 2.1 Handbook-first

The center of the product is the handbook itself, not an intermediate block model.

- users generate a handbook
- users remix a handbook from stored source data
- users edit the handbook directly in GrapesJS

There is no separate block editing phase in the 2.0 UI.

### 2.2 Smart Agent, Dumb Tools

Tools should stay narrow and composable.
They should not over-constrain the final handbook structure.

- tools produce simple structured inputs and outputs
- agent orchestration decides how to turn source data into a handbook
- handbook variety should come from agent planning, remix hints, style, and composition choices
- tools must not force the final HTML into a legacy block-first shape

### 2.3 Structured Data Over HTML Reverse Parsing

Whenever possible, downstream features should rely on structured data rather than reverse-parsing final HTML.

This is especially important for `Spots CSV`.

## 3. Final Workspace Shape

## 3.1 Left Column

The left column can keep the existing session/chat shell and navigation responsibilities.
It is not the main design change in this spec.

## 3.2 Center Column

The center column is the handbook canvas and is always in edit mode once a handbook exists.

- use GrapesJS as the editing engine
- show the handbook as the primary full-height workspace
- keep device-width controls if useful, but only as canvas width controls
- remove `Edit Handbook`, `Edit HTML`, `Done`, or any similar mode-switch affordances
- do not treat preview mode as a center-column state

The center should feel like a persistent editing canvas, not a preview iframe that sometimes swaps into edit mode.

## 3.3 Right Column

The right column changes role after handbook generation.

### Before handbook ready

The right column may still show processing-oriented guidance or assistant status while the flow is running.

### After handbook ready

The right column becomes the handbook modification workspace.

It keeps three secondary tabs:

- `Edit`
- `Spots`
- `Remix`

Default behavior:

- once a handbook is ready, open the right column on `Edit`
- `Edit` is the default editing inspector
- `Spots` and `Remix` remain available as secondary workspaces

The old `Assistant` tab label should not remain as the primary default in handbook-ready state because it implies a chat-first workspace instead of an edit-first workspace.

## 3.4 Preview Behavior

Preview is not a separate center-column mode.

- preview is triggered from the toolbar arrow / open-preview action
- preview is a supporting action for checking the final handbook result
- preview must not displace the normal editing canvas

## 3.5 Removed UI Concepts

The following concepts should be removed from the visible 2.0 editing experience:

- block editor workspace
- session editor workspace
- `centerViewMode = blocks`
- any user-facing language that implies handbook editing happens by editing blocks first

Compatibility data may remain internally, but it must not define the main product experience.

## 4. GrapesJS Editing Model

GrapesJS is the center canvas editing engine, not the product shell.

- GrapesJS owns the handbook canvas and selection model
- React owns the right-side workspace, top toolbar, and product-level actions
- the handbook remains persisted as single-file HTML
- adapter logic remains responsible for translating stored handbook HTML into editor input and back

This release is manual editing first.

- users can visually edit the handbook
- users can save handbook changes back to the existing handbook save path
- contextual toolbars such as text toolbar and block toolbar can remain
- editor-agent automation stays future-facing

## 5. Tool Contract Direction

## 5.1 `analyze_session_data`

This tool should be the main structured analysis tool.

Its public 2.0 output should center on source data such as:

- `guide_title`
- `summary`
- `sections`
- `spots`
- `remix_hints`

These are source-analysis structures, not front-end editing blocks.

`sections` may help the agent understand likely narrative groupings, but they are not a user-facing block editor contract.

## 5.2 `resolve_spot_coordinates`

This tool should operate on structured spots data, not legacy `spot_blocks`.

Recommended direction:

- input: source-data spots or latest analyzed spots
- output: resolved spots with coordinates

Legacy compatibility fields can remain temporarily if needed for older persistence or UI helpers, but they should not remain part of the 2.0 mental model.

## 5.3 `generate_handbook_html`

This tool should generate handbook HTML from source data and generation intent, not from a required `blocks` contract.

Recommended input direction:

- source data
- style choice
- prepared images
- resolved spots if available
- generation or remix guidance

Recommended output direction:

- full handbook HTML
- lightweight handbook metadata needed by the UI
- `used_spot_ids` or equivalent manifest of which spots were actually referenced in this handbook version

This `used_spot_ids` output is important because it avoids reverse-parsing HTML later to decide which spots belong in CSV export.

## 5.4 Remix

Remix should be defined as:

- reuse stored source data
- reuse remix hints
- apply a different style and/or narrative angle
- generate a genuinely different handbook result

Remix must not feel like re-skinning the same block layout every time.

To support this, source data persistence should preserve enough material for variation:

- multiple narrative angles
- structure variants
- visual motifs
- meaningful place and story detail from the crawl

## 6. Spots CSV Rule

The recommended export rule is:

`CSV = resolved spots intersected with spots actually used by the generated handbook`

Not:

- all detected spots from analysis
- spots reverse-parsed from HTML text
- legacy `spot_blocks` alone

Recommended implementation direction:

1. `analyze_session_data` produces structured `spots`
2. `resolve_spot_coordinates` enriches those spots with coordinates
3. `generate_handbook_html` returns `used_spot_ids`
4. `Spots CSV` is built from the subset of resolved spots whose ids appear in `used_spot_ids`

This keeps the system flexible while matching the product requirement:

only places actually mentioned in the produced handbook should be exported as the companion Google Maps CSV.

## 7. Current Release Scope

Included now:

- handbook-first workspace
- always-on GrapesJS editing canvas
- right-side `Edit / Spots / Remix`
- manual handbook editing and save
- spots mini map and CSV companion
- remix from stored source data

Deferred:

- editor agent that modifies GrapesJS through MCP
- AI command execution inside the editor workspace
- exposing component-level edit APIs as a stable public MCP

## 8. Success Criteria

This spec is satisfied when:

- the user no longer sees block/session editing as a primary UI path
- the center feels like a real handbook editor, not a preview-first shell
- the right side defaults to handbook editing tools after generation
- remix can produce materially different handbooks from the same stored source data
- spots CSV is based on used handbook spots with resolved coordinates
- tool contracts move away from block-first semantics in visible 2.0 behavior
